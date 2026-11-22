import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const BLUE = '#1F4FD1';
const INK = '#14213D';
const MUTED = '#5B6478';
const LINE = '#DDE3EE';
const TINT = '#EEF3FE';

export interface Column {
  header: string;
  key: string;
  width: number; // proportion (PDF) et largeur en caractères (Excel)
  align?: 'left' | 'right' | 'center';
  format?: (value: any, row: any) => string;
}

export interface Section {
  title: string;
  columns: Column[];
  rows: Record<string, any>[];
  empty?: string;
}

export interface Report {
  title: string;
  subtitle?: string;
  figures?: { label: string; value: string }[];
  paragraphs?: { title: string; text: string }[];
  sections: Section[];
}

const cell = (c: Column, row: any) => {
  const v = row[c.key];
  if (c.format) return c.format(v, row);
  return v === null || v === undefined ? '—' : String(v);
};

/* ------------------------------------ PDF ------------------------------------ */

export function renderPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: report.title, Author: 'TeamTrack' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    // En-tête
    doc.rect(0, 0, doc.page.width, 6).fill(BLUE);
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10).text('TeamTrack', left, 30);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(report.title, left, 50, { width });
    if (report.subtitle) doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(report.subtitle, { width });
    doc.fillColor(MUTED).fontSize(8).text(`Édité le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
    doc.moveDown(1.2);

    // Chiffres clés
    if (report.figures?.length) {
      const per = Math.min(4, report.figures.length);
      const boxW = (width - (per - 1) * 8) / per;
      let y = doc.y;
      report.figures.forEach((f, i) => {
        const col = i % per;
        if (col === 0 && i > 0) y += 56;
        const x = left + col * (boxW + 8);
        doc.roundedRect(x, y, boxW, 48, 4).fill(TINT);
        doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(16).text(f.value, x + 10, y + 8, { width: boxW - 20 });
        doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(f.label, x + 10, y + 30, { width: boxW - 20 });
      });
      doc.x = left;
      doc.y = y + 64;
    }

    for (const p of report.paragraphs ?? []) {
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(p.title, left, doc.y, { width });
      doc.moveDown(0.2);
      doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(p.text || '—', { width, lineGap: 2 });
      doc.moveDown(0.8);
    }

    for (const s of report.sections) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(s.title, left, doc.y, { width });
      doc.moveDown(0.4);
      const total = s.columns.reduce((a, c) => a + c.width, 0);
      const widths = s.columns.map((c) => (c.width / total) * width);
      const drawHeader = () => {
        const y = doc.y;
        doc.rect(left, y, width, 18).fill(BLUE);
        let x = left;
        s.columns.forEach((c, i) => {
          doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
            .text(c.header, x + 5, y + 5, { width: widths[i] - 10, align: c.align ?? 'left', lineBreak: false, ellipsis: true });
          x += widths[i];
        });
        doc.y = y + 18;
      };
      drawHeader();
      if (s.rows.length === 0) {
        doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text(s.empty ?? 'Aucune donnée.', left + 5, doc.y + 6);
        doc.moveDown(1);
      }
      s.rows.forEach((row, ri) => {
        const texts = s.columns.map((c) => cell(c, row));
        doc.font('Helvetica').fontSize(8.5);
        const h = Math.max(18, ...texts.map((t, i) => doc.heightOfString(t, { width: widths[i] - 10 }) + 8));
        if (doc.y + h > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        if (ri % 2 === 1) doc.rect(left, y, width, h).fill('#F7F9FC');
        let x = left;
        texts.forEach((t, i) => {
          doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(t, x + 5, y + 4, { width: widths[i] - 10, align: s.columns[i].align ?? 'left' });
          x += widths[i];
        });
        doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.y = y + h;
      });
      doc.x = left;
      doc.moveDown(1.2);
    }

    // Pied de page numéroté
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 30;
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
        .text(`${report.title} · page ${i + 1}/${range.count}`, left, bottom, { width, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

/* ----------------------------------- Excel ----------------------------------- */

export async function renderXlsx(report: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TeamTrack';
  wb.created = new Date();

  if (report.figures?.length || report.paragraphs?.length) {
    const ws = wb.addWorksheet('Synthèse');
    ws.addRow([report.title]).font = { bold: true, size: 14, color: { argb: 'FF1F4FD1' } };
    if (report.subtitle) ws.addRow([report.subtitle]).font = { color: { argb: 'FF5B6478' } };
    ws.addRow([]);
    for (const f of report.figures ?? []) {
      const r = ws.addRow([f.label, f.value]);
      r.getCell(1).font = { color: { argb: 'FF5B6478' } };
      r.getCell(2).font = { bold: true };
    }
    for (const p of report.paragraphs ?? []) {
      ws.addRow([]);
      ws.addRow([p.title]).font = { bold: true };
      ws.addRow([p.text]).alignment = { wrapText: true };
    }
    ws.getColumn(1).width = 42;
    ws.getColumn(2).width = 60;
  }

  for (const s of report.sections) {
    const name = s.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    const ws = wb.addWorksheet(name);
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(10, c.width * 4) }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4FD1' } };
    header.alignment = { vertical: 'middle' };
    header.height = 20;
    for (const row of s.rows) {
      ws.addRow(Object.fromEntries(s.columns.map((c) => [c.key, c.format ? cell(c, row) : row[c.key] ?? ''])));
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
