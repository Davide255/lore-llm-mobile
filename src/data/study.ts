import AsyncStorage from '@react-native-async-storage/async-storage';

import { kb } from '@/api';
import { streamStudy } from '@/api/study/study-client';
import type { Answer, GenerateRequest, GradeRequest, Question, QuestionResult, SessionResult, StudyEvent } from '@/api/study/types';
import { createSignal, invalidate, useQuery } from '@/data/store';
import { fromWire, parseProjectKey, splitPath, toWire } from '@/lib/paths';
import { effectiveMix, localDate, parseReport, sessionFromReport, type SavedReport, type StudyDraft, type StudyPreset } from '@/lib/study-model';

/**
 * Study mode state: the setup draft, the session in progress (questions arrive
 * one by one from the stream, answers stay on the device until hand-in), and
 * the user's criteria presets. A session lives in memory only: the server is
 * stateless and the report it saves at hand-in is the permanent record.
 */

export interface SourceProgress {
  path: string;
  status: 'loading' | 'ready' | 'skipped';
  kind: string;
  reason?: string;
}

export type SessionPhase = 'generating' | 'generate_failed' | 'answering' | 'grading' | 'grade_failed' | 'graded';

export interface StudySession {
  phase: SessionPhase;
  draft: StudyDraft;
  files: SourceProgress[];
  topics: string[];
  questions: Question[];
  total: number;
  answers: Record<string, Answer>;
  flagged: string[];
  current: number;
  startedAt: number | null;
  finishedAt: number | null;
  graded: Record<string, QuestionResult>;
  result: SessionResult | null;
  savedPath: string | null;
  saveError: string | null;
  error: string | null;
  /** When the session was frozen (answering only); null or absent while running. */
  pausedAt?: number | null;
}

export const studySession = createSignal<StudySession | null>(null);
/** A finished session reopened from a saved report: read-only, shown by the grade and answer screens. */
export const studyReview = createSignal<StudySession | null>(null);

/** The session the grade/answer screens show: a reopened one, else the live one. */
export function useShownSession(): StudySession | null {
  const review = studyReview.useValue();
  const live = studySession.useValue();
  return review ?? live;
}
export const studyDraft = createSignal<StudyDraft | null>(null);

let controller: AbortController | null = null;

function update(patch: Partial<StudySession> | ((s: StudySession) => Partial<StudySession>)) {
  const s = studySession.get();
  if (!s) return;
  studySession.set({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) });
}

function wireSource(path: string) {
  const w = toWire(path);
  return w.owner ? { path: w.path, owner: w.owner } : { path: w.path };
}

// ─── Generation ──────────────────────────────────────────────────────────────

export function startSession(draft: StudyDraft) {
  studyReview.set(null);
  clearPaused();
  // The tab follows the project the report will be saved in.
  setStudyProject(draft.project);
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  studySession.set({
    phase: 'generating',
    draft,
    files: draft.sources.map((p) => ({ path: p, status: 'loading', kind: '' })),
    topics: [],
    questions: [],
    total: Object.values(effectiveMix(draft)).reduce((s, n) => s + n, 0),
    answers: {},
    flagged: [],
    current: 0,
    startedAt: null,
    finishedAt: null,
    graded: {},
    result: null,
    savedPath: null,
    saveError: null,
    error: null,
  });

  const req: GenerateRequest = {
    sources: draft.sources.map(wireSource),
    mix: effectiveMix(draft),
    difficulty: draft.difficulty,
    citeSource: draft.citeSource,
    instructions: draft.instructions,
  };
  // The server speaks wire paths; the screens show the app's own.
  const appPath = new Map(draft.sources.map((p) => [toWire(p).path, p]));

  const onEvent = (e: StudyEvent) => {
    if (signal.aborted) return;
    if (e.event === 'file') {
      const path = appPath.get(e.data.path) ?? e.data.path;
      update((s) => ({ files: s.files.map((f) => (f.path === path ? { path, status: e.data.status, kind: e.data.kind, reason: e.data.reason } : f)) }));
    } else if (e.event === 'topics') update({ topics: e.data.topics });
    else if (e.event === 'question') {
      const q = e.data.question;
      const source = q.source ? { ...q.source, path: appPath.get(q.source.path) ?? q.source.path } : null;
      update((s) => ({ questions: [...s.questions, { ...q, source }], total: e.data.total }));
    }
  };

  streamStudy('generate', req, onEvent, signal)
    .then(() => {
      if (!signal.aborted) update({ phase: 'answering', startedAt: Date.now() });
    })
    .catch((err: unknown) => {
      if (!signal.aborted) update({ phase: 'generate_failed', error: err instanceof Error ? err.message : String(err) });
    });
}

export function retryGeneration() {
  const s = studySession.get();
  if (s) startSession(s.draft);
}

export function abortSession() {
  controller?.abort();
  controller = null;
  studySession.set(null);
  clearPaused();
}

// ─── Pause ───────────────────────────────────────────────────────────────────

const PAUSED_KEY = 'lore.study.paused.v1';

function clearPaused() {
  AsyncStorage.removeItem(PAUSED_KEY).catch(() => {});
}

/** Freezes the questions in progress (answers, flags, position, clock) and keeps them across app restarts. */
export function pauseSession() {
  const s = studySession.get();
  if (!s || s.phase !== 'answering' || s.draft.timeLimit) return;
  const paused = { ...s, pausedAt: Date.now() };
  studySession.set(paused);
  AsyncStorage.setItem(PAUSED_KEY, JSON.stringify(paused)).catch(() => {});
}

/** Unfreezes a paused session: the time away doesn't count towards the clock or the duration. */
export function resumeSession() {
  const s = studySession.get();
  if (!s?.pausedAt) return;
  const away = Date.now() - s.pausedAt;
  update({ pausedAt: null, startedAt: s.startedAt ? s.startedAt + away : null });
  clearPaused();
}

// ─── Answering ───────────────────────────────────────────────────────────────

export function setAnswer(id: string, patch: Answer) {
  update((s) => ({ answers: { ...s.answers, [id]: { ...s.answers[id], ...patch } } }));
}

export function toggleFlag(id: string) {
  update((s) => ({ flagged: s.flagged.includes(id) ? s.flagged.filter((x) => x !== id) : [...s.flagged, id] }));
}

export function goTo(index: number) {
  update((s) => ({ current: Math.max(0, Math.min(s.questions.length - 1, index)) }));
}

// ─── Hand-in ─────────────────────────────────────────────────────────────────

export function submitSession() {
  const s = studySession.get();
  if (!s || s.phase === 'grading') return;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const finishedAt = s.finishedAt ?? Date.now();
  clearPaused();
  update({ pausedAt: null, phase: 'grading', finishedAt, graded: {}, result: null, error: null, saveError: null, savedPath: null });

  const project = toWire(s.draft.project);
  const d = s.draft;
  const questions = s.questions.map((q) => (q.source ? { ...q, source: { ...q.source, path: toWire(q.source.path).path } } : q));
  const req: GradeRequest = {
    project: project.path,
    ...(project.owner ? { owner: project.owner } : {}),
    questions,
    answers: s.answers,
    criteria: d.criteria,
    instructions: d.instructions,
    scale: d.scale,
    difficulty: d.difficulty,
    ...(d.presetName ? { presetName: d.presetName } : {}),
    date: localDate(),
    durationSec: Math.round((finishedAt - (s.startedAt ?? finishedAt)) / 1000),
    sources: d.sources.map(wireSource),
  };
  const teamId = project.owner ? project.owner.slice(2) : null;

  const onEvent = (e: StudyEvent) => {
    if (signal.aborted) return;
    if (e.event === 'graded') update((cur) => ({ graded: { ...cur.graded, [e.data.questionId]: e.data } }));
    else if (e.event === 'result') update({ result: e.data });
    else if (e.event === 'saved') update({ savedPath: fromWire(teamId, e.data.path) });
    else if (e.event === 'save_failed') update({ saveError: e.data.message });
  };

  streamStudy('grade', req, onEvent, signal)
    .then(() => {
      if (signal.aborted) return;
      update({ phase: 'graded' });
      const done = studySession.get();
      if (done) archiveSession(done);
      // The report is a new note: the folder listings and the Studio tab must see it.
      invalidate();
    })
    .catch((err: unknown) => {
      if (!signal.aborted) update({ phase: 'grade_failed', error: err instanceof Error ? err.message : String(err) });
    });
}

// ─── Saved reports (C3) ──────────────────────────────────────────────────────

// The report note only keeps the summary (grade, criteria, status per question).
// To reopen it with every question, answer and comment, the finished session is
// also kept on this device, keyed by the report's path.
const ARCHIVE_KEY = 'lore.study.archive.v1';
const ARCHIVE_MAX = 30;
const archiveKey = (path: string) => `${ARCHIVE_KEY}:${path}`;

async function archiveSession(s: StudySession) {
  if (!s.savedPath || !s.result) return;
  const path = s.savedPath;
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
    const paths = [path, ...((raw ? (JSON.parse(raw) as string[]) : []).filter((p) => p !== path))];
    const dropped = paths.slice(ARCHIVE_MAX);
    await AsyncStorage.setItem(archiveKey(path), JSON.stringify({ ...s, error: null }));
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(paths.slice(0, ARCHIVE_MAX)));
    await Promise.all(dropped.map((p) => AsyncStorage.removeItem(archiveKey(p))));
  } catch {
    // Only the interactive review is lost: the report note is already saved.
  }
}

/**
 * Loads a saved report for review: this device's full copy when it has one
 * (it keeps the underlined quotes), else rebuilt from the report note itself.
 * False when the note isn't a readable report.
 */
export async function openReview(path: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(archiveKey(path));
    if (raw) {
      const s = JSON.parse(raw) as StudySession;
      if (s.result && Array.isArray(s.questions)) {
        studyReview.set({ ...s, phase: 'graded' });
        return true;
      }
    }
  } catch {
    // Fall through to the note.
  }
  try {
    const doc = await kb.getFile(path);
    const [first = ''] = splitPath(path);
    const teamId = parseProjectKey(first).teamId;
    const rebuilt = doc ? sessionFromReport(doc.content, first, (p) => fromWire(teamId, p)) : null;
    if (!doc || !rebuilt) return false;
    studyReview.set({
      phase: 'graded',
      draft: rebuilt.draft,
      files: [],
      topics: rebuilt.topics,
      questions: rebuilt.questions,
      total: rebuilt.questions.length,
      answers: rebuilt.answers,
      flagged: [],
      current: 0,
      startedAt: null,
      finishedAt: null,
      graded: {},
      result: rebuilt.result,
      savedPath: path,
      saveError: null,
      error: null,
    });
    return true;
  } catch {
    return false;
  }
}

export function closeReview() {
  studyReview.set(null);
}

/** The project's sessions, read back from the reports in `<project>/studio/`, newest first. */
export const useStudyReports = (project: string | null) =>
  useQuery(project ? `study-reports:${project}` : null, async (): Promise<SavedReport[]> => {
    const files = (await kb.listFiles(project!)).filter((p) => p.startsWith(`${project}/studio/`) && p.endsWith('.md'));
    const recent = files.sort().reverse().slice(0, 12);
    const docs = await Promise.all(recent.map((p) => kb.getFile(p).catch(() => null)));
    return docs.flatMap((doc) => {
      const data = doc ? parseReport(doc.content) : null;
      return doc && data ? [{ path: doc.path, data }] : [];
    });
  });

// ─── Preferences (device-local) ──────────────────────────────────────────────

const PROJECT_KEY = 'lore.study.project.v1';
const PRESETS_KEY = 'lore.study.presets.v1';

/** The project the Studio tab follows (null until loaded or chosen). */
export const studyProject = createSignal<string | null>(null);
export const studyPresets = createSignal<StudyPreset[]>([]);

let loaded = false;
export async function loadStudyPrefs() {
  if (loaded) return;
  loaded = true;
  try {
    const [project, presets, paused] = await Promise.all([AsyncStorage.getItem(PROJECT_KEY), AsyncStorage.getItem(PRESETS_KEY), AsyncStorage.getItem(PAUSED_KEY)]);
    if (project && studyProject.get() === null) studyProject.set(project);
    if (presets) studyPresets.set(JSON.parse(presets) as StudyPreset[]);
    if (paused && studySession.get() === null) {
      const s = JSON.parse(paused) as StudySession;
      if (s.phase === 'answering' && Array.isArray(s.questions) && s.questions.length) studySession.set(s);
    }
  } catch {
    // Preferences are a convenience: start from defaults.
  }
}

export function setStudyProject(project: string) {
  studyProject.set(project);
  AsyncStorage.setItem(PROJECT_KEY, project).catch(() => {});
}

export function savePreset(preset: StudyPreset) {
  const next = [preset, ...studyPresets.get().filter((p) => p.name !== preset.name)].slice(0, 20);
  studyPresets.set(next);
  AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(next)).catch(() => {});
}

export function deletePreset(name: string) {
  const next = studyPresets.get().filter((p) => p.name !== name);
  studyPresets.set(next);
  AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(next)).catch(() => {});
}
