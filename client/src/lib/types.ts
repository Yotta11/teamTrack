export type Role = 'admin' | 'tutor' | 'employee' | 'intern';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type IssueType = 'technical' | 'organizational' | 'skill' | 'resource' | 'personal';
export type Severity = 'low' | 'medium' | 'critical';
export type IssueStatus = 'open' | 'analysis' | 'in_progress' | 'resolved' | 'escalated';
export type InternshipStatus = 'upcoming' | 'active' | 'suspended' | 'completed' | 'evaluated';
export type SprintStatus = 'planned' | 'active' | 'closed';

export interface UserBrief {
  id: number;
  firstName: string;
  lastName: string;
  role: Role;
  avatarUrl?: string | null;
}

export interface User extends UserBrief {
  email: string;
  jobTitle: string | null;
  phone: string | null;
  skills: string[];
  departmentId: number | null;
  departmentName: string | null;
  isActive: boolean;
  wipLimit: number;
  lastLoginAt: string | null;
  createdAt: string;
  teams?: { id: number; name: string; isLead?: boolean }[];
  internship?: { id: number; startDate: string; endDate: string; status: InternshipStatus } | null;
}

export interface Department {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  teamCount: number;
}

export interface Team {
  id: number;
  name: string;
  description: string | null;
  leadId: number | null;
  departmentId: number | null;
  departmentName: string | null;
  wipInProgress: number | null;
  wipReview: number | null;
  lead: UserBrief | null;
  memberCount: number;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  avgProgress: number;
  activeSprint: { id: number; name: string; endDate: string } | null;
  members?: (User & { joinedAt: string })[];
  canManage?: boolean;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  dueDate: string | null;
  estimateHours: number | null;
  storyPoints: number | null;
  labels: string[];
  teamId: number;
  teamName: string;
  sprintId: number | null;
  sprintName: string | null;
  creatorId: number;
  validatedBy: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: UserBrief[];
  subtaskCount: number;
  subtaskDone: number;
  commentCount: number;
  attachmentCount: number;
  openIssueCount: number;
  isOverdue: boolean;
  isDueSoon: boolean;
}

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  weight: number;
  done: boolean;
}

export interface TaskDetail extends Task {
  creator: UserBrief;
  subtasks: Subtask[];
  comments: { id: number; content: string; createdAt: string; author: UserBrief }[];
  attachments: { id: number; fileName: string; mime: string; size: number; uploadedAt: string; uploadedByName: string }[];
  assignmentHistory: { id: number; active: boolean; assignedAt: string; unassignedAt: string | null; userName: string; delegatedByName: string | null }[];
  progressUpdates: { id: number; progress: number; note: string | null; createdAt: string; userName: string }[];
  activity: ActivityItem[];
  issues: { id: number; title: string; severity: Severity; status: IssueStatus; reportedAt: string }[];
  permissions: { canManage: boolean; canEdit: boolean; canUpdateProgress: boolean };
}

export interface ActivityItem {
  id: number;
  action: string;
  entity?: string;
  entityId?: number | null;
  summary: string | null;
  entityTitle?: string | null;
  createdAt: string;
  userName: string | null;
  avatarUrl?: string | null;
  isAudit?: boolean;
  ip?: string | null;
  userRole?: Role;
}

export interface Sprint {
  id: number;
  teamId: number;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  retroPositive: string | null;
  retroImprove: string | null;
  retroActions: string | null;
  closedAt: string | null;
  taskCount: number;
  doneCount: number;
  pointsTotal: number;
  pointsDone: number;
}

export interface Burndown {
  unit: string;
  total: number;
  points: { day: string; ideal: number; remaining: number | null }[];
}

export interface SprintDetail extends Sprint {
  teamName: string;
  tasks: Task[];
  burndown: Burndown;
  canManage: boolean;
}

export interface Issue {
  id: number;
  title: string;
  description: string;
  type: IssueType;
  severity: Severity;
  status: IssueStatus;
  reporterId: number;
  taskId: number | null;
  reportedAt: string;
  firstResponseAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  reporter: UserBrief;
  task: { id: number; title: string; teamName: string } | null;
  responseCount: number;
  isStale: boolean;
}

export interface IssueDetail extends Issue {
  responses: {
    id: number;
    content: string;
    actionDecided: string | null;
    fromStatus: IssueStatus | null;
    toStatus: IssueStatus | null;
    createdAt: string;
    author: UserBrief;
  }[];
  canHandle: boolean;
}

export interface Internship {
  id: number;
  internId: number;
  tutorId: number;
  delegateId: number | null;
  delegateUntil: string | null;
  school: string;
  subject: string;
  objectives: string;
  startDate: string;
  endDate: string;
  status: InternshipStatus;
  intern: UserBrief & { email: string; jobTitle: string | null; phone: string | null };
  tutor: UserBrief & { email: string };
  delegate: UserBrief | null;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  avgProgress: number;
  openIssues: number;
  evalAverage: number | null;
}

export interface InternshipDetail extends Internship {
  history: { id: number; fromStatus: InternshipStatus | null; toStatus: InternshipStatus; note: string | null; changedAt: string; changedByName: string | null }[];
  documents: { id: number; kind: string; fileName: string; mime: string; size: number; uploadedAt: string; uploadedByName: string }[];
  canManage: boolean;
  allowedTransitions: InternshipStatus[];
}

export interface Evaluation {
  id: number;
  internshipId: number;
  evaluatorId: number;
  evaluatorName: string;
  evalDate: string;
  attendance: number;
  quality: number;
  autonomy: number;
  communication: number;
  deadlines: number;
  comment: string | null;
  isFinal: boolean;
  average: number;
}

export interface Notification {
  id: number;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface KeyCount {
  key: string;
  count: number;
}
