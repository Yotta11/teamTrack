import { describe, expect, it } from 'vitest';
import { camelize } from '../src/utils/case.js';
import { addDays, dayRange, daysBetween } from '../src/utils/dates.js';
import { generateTempPassword, isStrongPassword } from '../src/utils/password.js';
import { completionRate, evaluationAverage, weightedProgress } from '../src/utils/progress.js';

describe('RG-05 : avancement pondéré des sous-tâches', () => {
  it('renvoie null sans sous-tâche', () => {
    expect(weightedProgress([])).toBeNull();
  });
  it('calcule la moyenne pondérée', () => {
    expect(weightedProgress([{ weight: 1, done: true }, { weight: 3, done: false }])).toBe(25);
    expect(weightedProgress([{ weight: 2, done: true }, { weight: 2, done: true }])).toBe(100);
  });
  it('considère un poids minimal de 1', () => {
    expect(weightedProgress([{ weight: 0, done: true }, { weight: 1, done: false }])).toBe(50);
  });
});

describe('indicateurs', () => {
  it('taux de réalisation', () => {
    expect(completionRate(0, 0)).toBe(0);
    expect(completionRate(3, 4)).toBe(75);
  });
  it('moyenne d’une évaluation sur 5 critères', () => {
    expect(evaluationAverage({ attendance: 5, quality: 4, autonomy: 3, communication: 4, deadlines: 4 })).toBe(4);
    expect(evaluationAverage({ attendance: 4, quality: 3, autonomy: 3, communication: 4, deadlines: 3 })).toBe(3.4);
  });
});

describe('politique de mots de passe', () => {
  it('refuse les mots de passe faibles', () => {
    for (const p of ['court1!', 'sansmajuscule1!', 'SANSMINUSCULE1!', 'SansChiffre!', 'SansSpecial1']) {
      expect(isStrongPassword(p)).toBe(false);
    }
  });
  it('accepte un mot de passe conforme', () => {
    expect(isStrongPassword('TeamTrack@2026')).toBe(true);
  });
  it('génère des mots de passe provisoires conformes', () => {
    for (let i = 0; i < 20; i++) expect(isStrongPassword(generateTempPassword())).toBe(true);
  });
});

describe('dates', () => {
  it('ajoute des jours et compte les écarts', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(daysBetween('2026-11-01', '2026-11-14')).toBe(13);
    expect(dayRange('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
});

describe('camelize', () => {
  it('convertit les clés snake_case en camelCase récursivement', () => {
    expect(camelize({ first_name: 'A', nested_list: [{ due_date: 'x' }] })).toEqual({ firstName: 'A', nestedList: [{ dueDate: 'x' }] });
  });
  it('préserve les dates et valeurs simples', () => {
    const d = new Date();
    expect(camelize({ created_at: d }).createdAt).toBe(d);
    expect(camelize(null)).toBeNull();
  });
});
