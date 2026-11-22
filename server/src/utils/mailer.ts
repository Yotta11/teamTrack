import nodemailer from 'nodemailer';
import { config } from '../config.js';

const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

/** Envoi d'e-mail. Sans SMTP configuré (développement), le message est écrit dans la console. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    if (!config.isTest) console.log(`\n📧 [e-mail simulé] À : ${to}\nObjet : ${subject}\n${text}\n`);
    return;
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text });
  } catch (err) {
    console.error("Échec de l'envoi d'e-mail :", (err as Error).message);
  }
}
