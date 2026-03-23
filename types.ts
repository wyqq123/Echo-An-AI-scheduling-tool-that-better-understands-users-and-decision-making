
export enum Tab {
  FUNNEL = 'funnel',
  TIMELINE = 'timeline',
  PODS = 'pods',
  COMPASS = 'compass'
}

export enum TaskCategory {
  WORK = 'Work',
  STUDY = 'Study',
  LIFE = 'Life',
  GROWTH = 'Growth'
}

export enum TaskIntent {
  BODY_MIND = 'Body & Mind',
  CAREER_BREAK = 'Career Break',
  ACADEMIC_SPRINT = 'Academic Sprint',
  DEEP_CONNECT = 'Deep Connect',
  WEALTH_CONTROL = 'Wealth Control',
  INNER_WILD = 'Inner Wild'
}

export enum TaskStatus {
  CANDIDATE = 'CANDIDATE', // Initial state for new tasks
  PENDING = 'PENDING', // Drawer tasks (was DRAWER)
  ANCHOR = 'ANCHOR', // One of the core 3
  ICEBREAKER = 'ICEBREAKER', // The first of the core 3
  DRAWER = 'DRAWER', // Deprecated, alias for PENDING
  COMPLETED = 'COMPLETED'
}

export enum FunnelStep {
  STEP_1_ALIGNMENT = 'alignment',
  STEP_2_LEVERAGE = 'leverage',
  STEP_3_FRICTION = 'friction',
  STEP_4_SACRIFICE = 'sacrifice'
}

export enum PodType {
  PRODUCTION = 'production', // Blue
  GROWTH = 'growth', // Green
  RECOVERY = 'recovery' // Purple
}

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  intent?: TaskIntent; // New intent field
  workflowNote?: string; // New workflow note field
  status: TaskStatus; 
  isAnchor: boolean; // Computed from status for backward compat
  isFrozen: boolean; // Legacy/Icebox
  frozenSince?: string; // ISO Date string when it entered icebox
  isRevived?: boolean; // If it was revived from icebox
  isArchived?: boolean; // New field for daily reset
  completed: boolean;
  duration: number; // in minutes
  decomposition_type?: "LINEAR" | "DIMENSIONAL"; // New field for skills routing
  startTime?: string; // HH:MM
  dateStr?: string; // YYYY-MM-DD
  dayOffset?: number; // Deprecated, use dateStr
}

export interface LeafNode {
  id: string;
  canonicalTitle: string; // Normalized name (e.g., "Coding")
  originalTitles: string[]; // History of raw titles mapped to this leaf
  count: number;          // Completion count
  category: TaskCategory;
  level: number;          // Visual growth level
  isFruit?: boolean;      // Whether it has evolved into a fruit
  intent?: TaskIntent;    // Which intent tree it belongs to
  quarterId?: string;     // Which quarter this leaf belongs to (e.g., "2026-Q1")
  completedTasks?: { taskId: string, completedAt: string }[]; // Track completed tasks and their dates
}

export interface TreeData {
  intent: TaskIntent | string;
  color: string;
  leaves: LeafNode[];
  totalTasks: number;
}

export interface SynergyLink {
  id: string;
  sourceLeafId: string;
  targetIntent: string;
  note?: string;
}

export interface UserProfile {
  name: string;
  avatar?: string;
  quarterlyThemes: FocusTheme[];
  identity?: string | null;
  domain?: string;
}

export interface FocusTheme {
  id: string;
  intent: TaskIntent; // Enum
  tags: string[];
  isPrimary: boolean;
}

export interface AppState {
  userProfile?: UserProfile;
  onboardingCompleted: boolean;
  forest: LeafNode[]; // Task Forest Data
  synergyLinks: SynergyLink[]; // Cross-tree links
  quarterlyGoal: string;
  activeTab: Tab;
  loading: boolean;
  showDecisionMatrix: boolean;
  pendingTasks: Task[]; // Tasks waiting for decision
}

export type Action =
  | { type: 'SET_TAB'; payload: Tab }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'START_DECISION_MATRIX'; payload: Task[] }
  | { type: 'DECIDE_TASK'; payload: { taskId: string; isAnchor: boolean; isFrozen: boolean } }
  | { type: 'FINISH_DECISION_MATRIX' }
  | { type: 'ADD_LEAF'; payload: LeafNode }
  | { type: 'GROW_LEAF'; payload: { id: string; taskId: string; completedAt: string } }
  | { type: 'ADD_SYNERGY_LINK'; payload: SynergyLink }
  | { type: 'COMPLETE_ONBOARDING'; payload: UserProfile };
