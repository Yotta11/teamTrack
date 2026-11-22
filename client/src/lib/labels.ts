import type { InternshipStatus, IssueStatus, IssueType, Priority, Role, Severity, SprintStatus, TaskStatus } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrateur',
  tutor: 'Tuteur',
  employee: 'Employé',
  intern: 'Stagiaire',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'À faire',
  in_progress: 'En cours',
  review: 'En revue',
  done: 'Terminé',
};

export const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  technical: 'Technique',
  organizational: 'Organisationnel',
  skill: 'Compétence',
  resource: 'Ressource',
  personal: 'Personnel',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  critical: 'Critique',
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Ouverte',
  analysis: 'En analyse',
  in_progress: 'En résolution',
  resolved: 'Résolue',
  escalated: 'Escaladée',
};

export const INTERNSHIP_STATUS_LABEL: Record<InternshipStatus, string> = {
  upcoming: 'À venir',
  active: 'En cours',
  suspended: 'Suspendu',
  completed: 'Terminé',
  evaluated: 'Évalué',
};

export const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planned: 'Planifié',
  active: 'En cours',
  closed: 'Clôturé',
};

export const CRITERIA: { key: 'attendance' | 'quality' | 'autonomy' | 'communication' | 'deadlines'; label: string; hint: string }[] = [
  { key: 'attendance', label: 'Assiduité', hint: 'Présence, ponctualité, régularité' },
  { key: 'quality', label: 'Qualité du travail', hint: 'Rigueur, fiabilité des livrables' },
  { key: 'autonomy', label: 'Autonomie', hint: 'Initiative, capacité à se débloquer' },
  { key: 'communication', label: 'Communication', hint: 'Clarté, remontée des informations' },
  { key: 'deadlines', label: 'Respect des délais', hint: 'Tenue des échéances' },
];

export const DOC_KIND_LABEL: Record<string, string> = {
  convention: 'Convention',
  attestation: 'Attestation',
  rapport: 'Rapport',
  autre: 'Autre',
};
