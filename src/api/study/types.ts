/**
 * Study mode wire types. Copy of lore-llm's study-lambda/src/types.ts (contract:
 * lore-llm docs/STUDY_API.md): change both together. Paths here are wire paths
 * (`Project/file.md` plus an `owner`), not the app's `Name@teamId` keys.
 */

export type Difficulty = 'ripasso' | 'esame' | 'orale';
export type Scale = '30' | '10' | 'percent' | 'judgement';
export type QuestionType = 'mc' | 'tf' | 'open';

export interface SourceRef {
  path: string;
  owner?: string;
}

export interface QuestionSource {
  path: string;
  locator: string;
  excerpt: string;
}

interface QuestionBase {
  id: string;
  topic: string;
  prompt: string;
  source: QuestionSource | null;
}

export type Question = QuestionBase &
  (
    | { type: 'mc'; options: string[]; correctIndex: number; explanation: string }
    | { type: 'tf'; correct: boolean; explanation: string }
    | { type: 'open'; expectedPoints: string[] }
  );

export interface Answer {
  choice?: number;
  value?: boolean;
  motivation?: string;
  text?: string;
}

export interface Criterion {
  id: string;
  name: string;
  description: string;
  /** Percent; the weights of a session sum to 100. */
  weight: number;
}

export interface GenerateRequest {
  sources: SourceRef[];
  mix: { mc: number; tf: number; open: number };
  difficulty: Difficulty;
  citeSource: boolean;
  instructions: string;
}

export interface GradeRequest {
  project: string;
  owner?: string;
  questions: Question[];
  answers: Record<string, Answer>;
  criteria: Criterion[];
  instructions: string;
  scale: Scale;
  difficulty: Difficulty;
  presetName?: string;
  date: string;
  durationSec: number;
  sources: SourceRef[];
}

export interface Highlight {
  quote: string;
  kind: 'good' | 'wrong';
}

export interface QuestionResult {
  questionId: string;
  status: 'correct' | 'wrong' | 'partial' | 'empty';
  /** 0…1 */
  score: number;
  /** 0…10 per criterion id. */
  criterionScores?: Record<string, number>;
  comment?: string;
  highlights?: Highlight[];
}

export interface SessionResult {
  grade: { fraction: number; label: string; suffix: string };
  scale: Scale;
  headline: string;
  subline: string;
  closedCorrect: number;
  closedTotal: number;
  openAverage: number | null;
  durationSec: number;
  criteria: { id: string; name: string; weight: number; score: number | null; note: string }[];
  questions: QuestionResult[];
  topics: string[];
}

export type SourceKind = 'markdown' | 'pdf' | 'image' | 'unsupported';

export type StudyEvent =
  | { event: 'file'; data: { path: string; status: 'loading' | 'ready' | 'skipped'; kind: SourceKind; bytes?: number; reason?: string } }
  | { event: 'topics'; data: { topics: string[] } }
  | { event: 'question'; data: { question: Question; index: number; total: number } }
  | { event: 'graded'; data: QuestionResult }
  | { event: 'result'; data: SessionResult }
  | { event: 'saved'; data: { path: string } }
  | { event: 'save_failed'; data: { message: string } }
  | { event: 'done'; data: Record<string, unknown> }
  | { event: 'error'; data: { message: string; code: string } };

/** The ```lore-study block at the end of a saved report (see parseReport). */
export interface ReportData {
  v: number;
  date: string;
  grade: { label: string; suffix: string; fraction: number };
  scale: Scale;
  headline: string;
  topics: string[];
  closedCorrect: number;
  closedTotal: number;
  openAverage: number | null;
  durationSec: number;
  preset?: string;
  criteria: { name: string; weight: number; score: number | null }[];
  questions: { id: string; type: QuestionType; topic: string; status: string; score: number }[];
  sources: string[];
}
