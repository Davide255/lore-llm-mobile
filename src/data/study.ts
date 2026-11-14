import AsyncStorage from '@react-native-async-storage/async-storage';

import { kb } from '@/api';
import { streamStudy } from '@/api/study/study-client';
import type { Answer, GenerateRequest, GradeRequest, Question, QuestionResult, SessionResult, StudyEvent } from '@/api/study/types';
import { createSignal, invalidate, useQuery } from '@/data/store';
import { fromWire, toWire } from '@/lib/paths';
import { effectiveMix, localDate, parseReport, type SavedReport, type StudyDraft, type StudyPreset } from '@/lib/study-model';

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
}

export const studySession = createSignal<StudySession | null>(null);
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
  update({ phase: 'grading', finishedAt, graded: {}, result: null, error: null, saveError: null, savedPath: null });

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
      // The report is a new note: the folder listings and the Studio tab must see it.
      invalidate();
    })
    .catch((err: unknown) => {
      if (!signal.aborted) update({ phase: 'grade_failed', error: err instanceof Error ? err.message : String(err) });
    });
}

// ─── Saved reports (C3) ──────────────────────────────────────────────────────

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
    const [project, presets] = await Promise.all([AsyncStorage.getItem(PROJECT_KEY), AsyncStorage.getItem(PRESETS_KEY)]);
    if (project && studyProject.get() === null) studyProject.set(project);
    if (presets) studyPresets.set(JSON.parse(presets) as StudyPreset[]);
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
