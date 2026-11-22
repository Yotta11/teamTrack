import { describe, expect, it } from 'vitest';
import { dueLabel, fileSize, fullName, initials, pct, plusDaysISO, todayISO } from '../lib/format';

describe('format', () => {
  it('libellés d’échéance relatifs', () => {
    expect(dueLabel(null)).toBe('Sans échéance');
    expect(dueLabel(todayISO())).toBe("Aujourd'hui");
    expect(dueLabel(plusDaysISO(1))).toBe('Demain');
    expect(dueLabel(plusDaysISO(-3))).toBe('3 j de retard');
    expect(dueLabel(plusDaysISO(4))).toBe('Dans 4 j');
  });
  it('noms et initiales', () => {
    expect(fullName({ firstName: 'Grâce', lastName: 'Ngo Bassa' })).toBe('Grâce Ngo Bassa');
    expect(initials({ firstName: 'grâce', lastName: 'ngo' })).toBe('GN');
    expect(fullName(null)).toBe('—');
  });
  it('pourcentages et tailles', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBe(0);
    expect(fileSize(512)).toBe('512 o');
    expect(fileSize(2048)).toBe('2 Ko');
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 Mo');
  });
});
