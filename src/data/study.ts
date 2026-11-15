import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { BackgroundTime } from '../../modules/background-time';
import { kb } from '@/api';
import { streamStudy } from '@/api/study/study-client';
import type { Answer, GenerateRequest, GradeRequest, Question, QuestionResult, QuestionType, SessionResult, StudyEvent } from '@/api/study/types';
import { KBError } from '@/api/types';
import { createSignal, invalidate, useQuery } from '@/data/store';
import { fromWire, parseProjectKey, splitPath, toWire } from '@/lib/paths';
import {
  DEFAULT_PROFILES,
  effectiveMix,
  localDate,
  MAX_PROFILES,
  parseReport,
  profileFromPreset,
  sessionFromReport,
  type SavedReport,
  type StudyDraft,
  type StudyPreset,
  type StudyProfile,
} from '@/lib/study-model';

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

// ─── Streams that survive the background ─────────────────────────────────────
//
// iOS freezes the app shortly after it leaves the screen, and a frozen app's
// connection dies. So: while a stream runs the app asks iOS for extra time
// (about 30 s, often enough to finish); if that runs out or the connection is
// cut while away, the stream is picked up on return — generation asks only for
// the questions still missing, grading starts over (nothing is saved until the
// end). The live session is also kept on disk, in case iOS closes the app.

let controller: AbortController | null = null;
/** The stream running now, if any. */
let running: 'generate' | 'grade' | null = null;
/** The app went to the background while the stream ran. */
let awayDuringStream = false;
/** The stream was stopped while away: pick it up when the app is back. */
let resumeOnReturn = false;
let lastEventAt = 0;
let backgroundAt = 0;
let watchdog: ReturnType<typeof setTimeout> | null = null;
const BG_TASK = 'lore.study.stream';
/** Back from a long absence with no native background time: a stream silent this long is dead. */
const STALL_MS = 20_000;

function stopStream() {
  controller?.abort();
  controller = null;
  running = null;
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
  BackgroundTime.end(BG_TASK);
}

function runStream(
  op: 'generate' | 'grade',
  req: GenerateRequest | GradeRequest,
  onEvent: (e: StudyEvent) => void,
  onDone: () => void,
  onFail: (err: unknown) => void,
) {
  stopStream();
  const ctl = new AbortController();
  controller = ctl;
  running = op;
  awayDuringStream = AppState.currentState !== 'active';
  resumeOnReturn = false;
  lastEventAt = Date.now();
  BackgroundTime.begin(BG_TASK);
  const settle = () => {
    if (controller !== ctl) return;
    controller = null;
    running = null;
    BackgroundTime.end(BG_TASK);
  };
  streamStudy(
    op,
    req,
    (e) => {
      if (ctl.signal.aborted) return;
      lastEventAt = Date.now();
      onEvent(e);
    },
    ctl.signal,
  )
    .then(() => {
      if (ctl.signal.aborted) return;
      settle();
      onDone();
    })
    .catch((err: unknown) => {
      if (ctl.signal.aborted) return;
      settle();
      // Cut while away (iOS froze the app): not a failure, just pick it up again.
      if (err instanceof KBError && err.code === 'network' && (awayDuringStream || AppState.currentState !== 'active')) {
        if (AppState.currentState === 'active') resumeStream();
        else resumeOnReturn = true;
        return;
      }
      onFail(err);
    });
}

/** Picks up the stream the live session was waiting for. */
function resumeStream() {
  const s = studySession.get();
  if (!s || running) return;
  if (s.phase === 'generating') generate();
  else if (s.phase === 'grading') {
    // The report may already be saved, with only the end of the stream lost.
    if (s.result && s.savedPath) finishGrading();
    else submitSession();
  }
}

AppState.addEventListener('change', (state) => {
  if (state === 'background') {
    backgroundAt = Date.now();
    if (running) awayDuringStream = true;
    persistNow();
    return;
  }
  if (state !== 'active') return;
  if (resumeOnReturn) {
    resumeOnReturn = false;
    resumeStream();
    return;
  }
  // A frozen connection may never report its death: if the stream stays silent after a
  // long absence (longer than iOS's extra time, or without it), start it again.
  if (running && awayDuringStream && (!BackgroundTime.isAvailable || Date.now() - backgroundAt > 25_000)) {
    const back = Date.now();
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      watchdog = null;
      if (running && lastEventAt < back) {
        stopStream();
        resumeStream();
      }
    }, STALL_MS);
  }
});

// iOS's extra time is over and the app is about to freeze: stop cleanly, resume on return.
BackgroundTime.onExpire((key) => {
  if (key !== BG_TASK || !running) return;
  stopStream();
  resumeOnReturn = true;
  persistNow();
});

// ─── The live session on disk ────────────────────────────────────────────────

const LIVE_KEY = 'lore.study.live.v1';
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Writes the live session (or clears it once graded or closed). */
function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  const s = studySession.get();
  if (!s || s.phase === 'graded') AsyncStorage.removeItem(LIVE_KEY).catch(() => {});
  else AsyncStorage.setItem(LIVE_KEY, JSON.stringify({ ...s, savedAt: Date.now() })).catch(() => {});
}

function persistSoon() {
  if (!persistTimer) persistTimer = setTimeout(persistNow, 600);
}

/** The session kept on disk by a previous run of the app, ready to go on. */
function restoreLive(raw: string) {
  const s = JSON.parse(raw) as StudySession & { savedAt?: number };
  if (!s?.draft || !Array.isArray(s.questions)) return;
  const { savedAt, ...session } = s;
  // A session without a time limit doesn't count the time the app was closed: it comes back paused.
  if (session.phase === 'answering' && !session.draft.timeLimit && !session.pausedAt) session.pausedAt = savedAt ?? Date.now();
  studySession.set(session);
  if (session.phase === 'generating' || session.phase === 'grading') resumeStream();
}

function update(patch: Partial<StudySession> | ((s: StudySession) => Partial<StudySession>)) {
  const s = studySession.get();
  if (!s) return;
  studySession.set({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) });
  persistSoon();
}

function wireSource(path: string) {
  const w = toWire(path);
  return w.owner ? { path: w.path, owner: w.owner } : { path: w.path };
}

// ─── Generation ──────────────────────────────────────────────────────────────

export function startSession(draft: StudyDraft) {
  studyReview.set(null);
  // The tab follows the project the report will be saved in.
  setStudyProject(draft.project);
  stopStream();
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
  persistNow();
  generate();
}

/**
 * Asks for the questions still missing from the live session: all of them at
 * first, the rest after an interruption (those already here stay, and the AI
 * is told not to repeat them).
 */
function generate() {
  const s = studySession.get();
  if (!s) return;
  const { draft, questions: have } = s;
  const want = effectiveMix(draft);
  const got = (type: QuestionType) => have.filter((q) => q.type === type).length;
  const mix = { mc: Math.max(0, want.mc - got('mc')), tf: Math.max(0, want.tf - got('tf')), open: Math.max(0, want.open - got('open')) };
  if (have.length && mix.mc + mix.tf + mix.open === 0) {
    update({ phase: 'answering', error: null, startedAt: Date.now() });
    return;
  }
  update({ phase: 'generating', error: null });

  const req: GenerateRequest = {
    sources: draft.sources.map(wireSource),
    mix,
    difficulty: draft.difficulty,
    // The source is always cited (design A3): the answer screens link back to the note.
    citeSource: true,
    instructions: withoutRepeats(draft.instructions, have),
  };
  // The server speaks wire paths; the screens show the app's own.
  const appPath = new Map(draft.sources.map((p) => [toWire(p).path, p]));
  const base = have.length;

  const onEvent = (e: StudyEvent) => {
    if (e.event === 'file') {
      const path = appPath.get(e.data.path) ?? e.data.path;
      update((cur) => ({ files: cur.files.map((f) => (f.path === path ? { path, status: e.data.status, kind: e.data.kind, reason: e.data.reason } : f)) }));
    } else if (e.event === 'topics') update((cur) => ({ topics: base ? [...new Set([...cur.topics, ...e.data.topics])] : e.data.topics }));
    else if (e.event === 'question') {
      const q = e.data.question;
      const source = q.source ? { ...q.source, path: appPath.get(q.source.path) ?? q.source.path } : null;
      update((cur) => {
        // A resumed run numbers its questions from the start again.
        let id = q.id;
        for (let n = 2; cur.questions.some((x) => x.id === id); n++) id = `${q.id}-${n}`;
        return { questions: [...cur.questions, { ...q, id, source }], total: base + e.data.total };
      });
    }
  };

  runStream(
    'generate',
    req,
    onEvent,
    () => update({ phase: 'answering', startedAt: Date.now() }),
    (err) => update({ phase: 'generate_failed', error: err instanceof Error ? err.message : String(err) }),
  );
}

/** The user's instructions plus the questions already written, within the server's 2000 characters. */
function withoutRepeats(instructions: string, have: Question[]): string {
  if (!have.length) return instructions;
  const head = `${instructions ? `${instructions}\n\n` : ''}Domande già fatte in questa sessione, da non ripetere:`;
  let out = head;
  for (const q of have) {
    const line = `\n- ${q.prompt.replace(/\s+/g, ' ').slice(0, 160)}`;
    if (out.length + line.length > 2000) break;
    out += line;
  }
  return out.length > head.length ? out : instructions;
}

/** «Riprova» after a failed preparation: keeps the questions already written. */
export function retryGeneration() {
  if (studySession.get()) generate();
}

export function abortSession() {
  stopStream();
  resumeOnReturn = false;
  studySession.set(null);
  persistNow();
}

// ─── Pause ───────────────────────────────────────────────────────────────────

/** Freezes the questions in progress (answers, flags, position, clock); kept across app restarts. */
export function pauseSession() {
  const s = studySession.get();
  if (!s || s.phase !== 'answering' || s.draft.timeLimit) return;
  studySession.set({ ...s, pausedAt: Date.now() });
  persistNow();
}

/** Unfreezes a paused session: the time away doesn't count towards the clock or the duration. */
export function resumeSession() {
  const s = studySession.get();
  if (!s?.pausedAt) return;
  const away = Date.now() - s.pausedAt;
  update({ pausedAt: null, startedAt: s.startedAt ? s.startedAt + away : null });
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
  if (!s || running === 'grade') return;
  const finishedAt = s.finishedAt ?? Date.now();
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
    if (e.event === 'graded') update((cur) => ({ graded: { ...cur.graded, [e.data.questionId]: e.data } }));
    else if (e.event === 'result') update({ result: e.data });
    else if (e.event === 'saved') update({ savedPath: fromWire(teamId, e.data.path) });
    else if (e.event === 'save_failed') update({ saveError: e.data.message });
  };

  runStream('grade', req, onEvent, finishGrading, (err) => update({ phase: 'grade_failed', error: err instanceof Error ? err.message : String(err) }));
}

function finishGrading() {
  update({ phase: 'graded' });
  persistNow();
  const done = studySession.get();
  if (done) archiveSession(done);
  // The report is a new note: the folder listings and the Studio tab must see it.
  invalidate();
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
const PROFILES_KEY = 'lore.study.profiles.v1';
const OLD_PAUSED_KEY = 'lore.study.paused.v1';

/** The project the Studio tab follows (null until loaded or chosen). */
export const studyProject = createSignal<string | null>(null);
/** Grading profiles (A4/A5), kept on this device. */
export const studyProfiles = createSignal<StudyProfile[]>(DEFAULT_PROFILES);

let loaded = false;
export async function loadStudyPrefs() {
  if (loaded) return;
  loaded = true;
  try {
    const [project, profiles, presets, live, paused] = await Promise.all([
      AsyncStorage.getItem(PROJECT_KEY),
      AsyncStorage.getItem(PROFILES_KEY),
      AsyncStorage.getItem(PRESETS_KEY),
      AsyncStorage.getItem(LIVE_KEY),
      AsyncStorage.getItem(OLD_PAUSED_KEY),
    ]);
    if (project && studyProject.get() === null) studyProject.set(project);
    if (profiles) studyProfiles.set(JSON.parse(profiles) as StudyProfile[]);
    else if (presets) {
      // First run with profiles: the old criteria presets join the defaults.
      const list = [...DEFAULT_PROFILES];
      for (const p of JSON.parse(presets) as StudyPreset[]) list.push(profileFromPreset(p, list));
      writeProfiles(list.slice(0, MAX_PROFILES));
      AsyncStorage.removeItem(PRESETS_KEY).catch(() => {});
    }
    // The session the app was in when it was last closed (older builds only kept paused ones).
    if (paused) AsyncStorage.removeItem(OLD_PAUSED_KEY).catch(() => {});
    const saved = live ?? paused;
    if (saved && studySession.get() === null) restoreLive(saved);
  } catch {
    // Preferences are a convenience: start from defaults.
  }
}

export function setStudyProject(project: string) {
  studyProject.set(project);
  AsyncStorage.setItem(PROJECT_KEY, project).catch(() => {});
}

function writeProfiles(list: StudyProfile[]) {
  studyProfiles.set(list);
  AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(list)).catch(() => {});
}

export function getProfile(id: string | undefined): StudyProfile | undefined {
  return id ? studyProfiles.get().find((p) => p.id === id) : undefined;
}

/** Adds the profile, or replaces the one with its id (keeping its place). */
export function saveProfile(profile: StudyProfile) {
  const list = studyProfiles.get();
  const at = list.findIndex((p) => p.id === profile.id);
  writeProfiles(at >= 0 ? list.map((p, i) => (i === at ? profile : p)) : [...list, profile].slice(0, MAX_PROFILES));
}

export function deleteProfile(id: string) {
  writeProfiles(studyProfiles.get().filter((p) => p.id !== id));
}
