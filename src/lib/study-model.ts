/**
 * Study mode rules that don't need React or the network (and are tested):
 * the setup draft and its validation, criteria weights, the summary grid,
 * and reading back the reports the server saves in `<project>/studio/`.
 */
import type { Answer, Criterion, Difficulty, Question, QuestionResult, QuestionType, ReportData, Scale, SessionResult } from '@/api/study/types';

export interface StudyDraft {
  /** App project key (`Name` or `Name@teamId`): where the report is saved. */
  project: string;
  /** App paths of the chosen notes, in any project. */
  sources: string[];
  counts: Record<QuestionType, number>;
  enabled: Record<QuestionType, boolean>;
  difficulty: Difficulty;
  /** Off: closed questions show right/wrong as soon as they are answered. */
  correctionAtEnd: boolean;
  citeSource: boolean;
  timeLimit: boolean;
  /** The limit in minutes, chosen by the user; absent in older drafts (then the estimate is used). */
  timeLimitMin?: number;
  instructions: string;
  criteria: Criterion[];
  scale: Scale;
  /** The grading profile's name, sent with the hand-in and written in the report. */
  presetName?: string;
  /** The grading profile chosen in A4; its fields are copied into the draft. */
  profileId?: string;
}

/** Criteria presets of the first Studio release, migrated into profiles. */
export interface StudyPreset {
  name: string;
  instructions: string;
  criteria: Criterion[];
  scale: Scale;
}

// ─── Grading profiles (A4 / A5) ──────────────────────────────────────────────

export type ProfileIcon = 'gavel' | 'heart' | 'document' | 'school' | 'bulb' | 'science' | 'book' | 'voice';

export interface StudyProfile {
  id: string;
  name: string;
  icon: ProfileIcon;
  /** How the AI grades, in the user's words (also sent to question generation). */
  instructions: string;
  criteria: Criterion[];
  scale: Scale;
  /** Off: closed questions show right/wrong as soon as they are answered. */
  correctionAtEnd: boolean;
}

export const PROFILE_ICONS: ProfileIcon[] = ['gavel', 'heart', 'document', 'school', 'bulb', 'science', 'book', 'voice'];
export const MAX_PROFILES = 20;

const crit = (...list: [string, string, number][]): Criterion[] =>
  list.map(([name, description, weight]) => ({ id: slug(name), name, description, weight }));

export const DEFAULT_PROFILES: StudyProfile[] = [
  {
    id: 'orale',
    name: 'Orale severo',
    icon: 'gavel',
    instructions: 'Severo come all’orale. Penalizza i teoremi enunciati senza ipotesi e le definizioni approssimative. Voto in trentesimi, correzione alla fine.',
    criteria: crit(['Rigore', 'Definizioni e ipotesi esatte', 40], ['Completezza', 'Tutti i passaggi richiesti', 30], ['Chiarezza', 'Esposizione ordinata', 20], ['Esempi', 'Controesempi pertinenti', 10]),
    scale: '30',
    correctionAtEnd: true,
  },
  {
    id: 'coach',
    name: 'Coach gentile',
    icon: 'heart',
    instructions: 'Incoraggia e segnala solo l’essenziale: cosa manca per arrivare alla risposta giusta. Voto in decimi, correggi dopo ogni domanda.',
    criteria: crit(['Comprensione', 'Ha capito il concetto', 60], ['Chiarezza', 'Si spiega in modo ordinato', 40]),
    scale: '10',
    correctionAtEnd: false,
  },
  {
    id: 'scritto',
    name: 'Scritto d’esame',
    icon: 'document',
    instructions: 'Conta ogni passaggio, come in uno scritto: un risultato senza svolgimento vale poco. Voto in trentesimi, correzione alla fine.',
    criteria: crit(['Correttezza', 'Risultati e passaggi giusti', 50], ['Completezza', 'Tutti i passaggi richiesti', 30], ['Rigore', 'Notazione e ipotesi esatte', 20]),
    scale: '30',
    correctionAtEnd: true,
  },
];

/** «Severo come all’orale · /30»: the first sentence of the instructions and the scale. */
export function profileSubtitle(p: Pick<StudyProfile, 'instructions' | 'scale'>): string {
  const first = p.instructions.trim().split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, '') ?? '';
  const scale = p.scale === 'judgement' ? 'a giudizio' : SCALE_LABELS[p.scale];
  return first ? `${first} · ${scale}` : `Voto ${scale}`;
}

/**
 * The scale and the correction mode, read from a profile's instructions (the
 * editor has no switches for them): «/10», «in decimi», «in percentuale», «a
 * giudizio»; «dopo ogni domanda», «subito». Defaults: /30, at the end.
 */
export function gradingFromInstructions(text: string): Pick<StudyProfile, 'scale' | 'correctionAtEnd'> {
  const s = text.toLowerCase();
  const scale: Scale = /\/\s*10\b|\bdecim|\bsu 10\b/.test(s)
    ? '10'
    : /\/\s*30\b|trentesim|\bsu 30\b/.test(s)
      ? '30'
      : /%|percentual|per cento/.test(s)
        ? 'percent'
        : /giudizi/.test(s)
          ? 'judgement'
          : '30';
  const immediate = /dopo ogni (domanda|risposta)|\bsubito\b|man mano|correzione immediata/.test(s);
  return { scale, correctionAtEnd: !immediate };
}

/** Why a profile can't be saved yet, or null. */
export function profileError(p: StudyProfile): string | null {
  if (!p.name.trim()) return 'Dai un nome al profilo';
  if (p.criteria.some((c) => !c.name.trim())) return 'Ogni criterio ha bisogno di un nome';
  if (p.criteria.length && Math.round(weightSum(p.criteria)) !== 100) return `I pesi devono fare 100% (ora ${Math.round(weightSum(p.criteria))}%)`;
  return null;
}

/** The draft graded by `p`: its instructions, criteria, scale and correction mode. */
export function applyProfile(d: StudyDraft, p: StudyProfile): StudyDraft {
  return {
    ...d,
    profileId: p.id,
    presetName: p.name,
    instructions: p.instructions,
    criteria: p.criteria.map((c) => ({ ...c })),
    scale: p.scale,
    correctionAtEnd: p.correctionAtEnd,
  };
}

export function newProfileId(existing: { id: string }[], name: string): string {
  const base = slug(name) || 'profilo';
  let id = base;
  for (let n = 2; existing.some((p) => p.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** Old presets become profiles (once): same name, criteria and scale. */
export function profileFromPreset(p: StudyPreset, existing: { id: string }[]): StudyProfile {
  return { id: newProfileId(existing, p.name), name: p.name, icon: 'school', instructions: p.instructions, criteria: p.criteria, scale: p.scale, correctionAtEnd: true };
}

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

export const MAX_PER_TYPE = 20;
export const MAX_QUESTIONS = 30;
export const MAX_SOURCES = 12;
export const MAX_CRITERIA = 8;

export const DEFAULT_CRITERIA: Criterion[] = [
  { id: 'rigore', name: 'Rigore', description: 'Definizioni e ipotesi esatte', weight: 40 },
  { id: 'completezza', name: 'Completezza', description: 'Tutti i passaggi richiesti', weight: 30 },
  { id: 'chiarezza', name: 'Chiarezza', description: 'Esposizione ordinata', weight: 20 },
  { id: 'esempi', name: 'Esempi', description: 'Controesempi pertinenti', weight: 10 },
];

export function defaultDraft(project: string): StudyDraft {
  return {
    project,
    sources: [],
    counts: { mc: 4, tf: 4, open: 2 },
    enabled: { mc: true, tf: true, open: true },
    difficulty: 'esame',
    correctionAtEnd: true,
    citeSource: true,
    timeLimit: false,
    instructions: '',
    criteria: DEFAULT_CRITERIA.map((c) => ({ ...c })),
    scale: '30',
  };
}

export const TYPE_LABELS: Record<QuestionType, string> = { mc: 'Risposta multipla', tf: 'Vero o falso', open: 'Risposta aperta' };
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { ripasso: 'Ripasso', esame: 'Esame', orale: 'Orale' };
export const SCALE_LABELS: Record<Scale, string> = { '30': '/30', '10': '/10', percent: '%', judgement: 'Giudizio' };

/** Questions per type actually requested (a disabled type counts 0). */
export function effectiveMix(d: Pick<StudyDraft, 'counts' | 'enabled'>): Record<QuestionType, number> {
  return { mc: d.enabled.mc ? d.counts.mc : 0, tf: d.enabled.tf ? d.counts.tf : 0, open: d.enabled.open ? d.counts.open : 0 };
}

export function totalQuestions(d: Pick<StudyDraft, 'counts' | 'enabled'>): number {
  const m = effectiveMix(d);
  return m.mc + m.tf + m.open;
}

/** Rough answering time: a minute per closed question, three and a half per open one. */
export function estimatedMinutes(d: Pick<StudyDraft, 'counts' | 'enabled'>): number {
  const m = effectiveMix(d);
  return Math.round(m.mc + m.tf + m.open * 3.5);
}

export const MIN_TIME_LIMIT = 5;
export const MAX_TIME_LIMIT = 180;

/** The session's time limit in minutes: the user's choice, else the estimate rounded to 5 minutes. */
export function timeLimitMinutes(d: Pick<StudyDraft, 'counts' | 'enabled' | 'timeLimitMin'>): number {
  const n = d.timeLimitMin ?? Math.round(estimatedMinutes(d) / 5) * 5;
  return Math.max(MIN_TIME_LIMIT, Math.min(MAX_TIME_LIMIT, n));
}

export function weightSum(criteria: Criterion[]): number {
  return criteria.reduce((s, c) => s + c.weight, 0);
}

/** Why the user can't leave this setup step yet, or null. */
export function stepError(d: StudyDraft, step: 'sources' | 'types' | 'criteria'): string | null {
  if (step === 'sources') {
    if (!d.sources.length) return 'Scegli almeno un appunto';
    if (d.sources.length > MAX_SOURCES) return `Al massimo ${MAX_SOURCES} appunti per sessione`;
    return null;
  }
  if (step === 'types') {
    const total = totalQuestions(d);
    if (total < 1) return 'Scegli almeno una domanda';
    if (total > MAX_QUESTIONS) return `Al massimo ${MAX_QUESTIONS} domande per sessione`;
    return null;
  }
  if (effectiveMix(d).open > 0 && !d.criteria.length) return 'Le risposte aperte hanno bisogno di almeno un criterio';
  if (d.criteria.length && Math.round(weightSum(d.criteria)) !== 100) return `I pesi devono fare 100% (ora ${Math.round(weightSum(d.criteria))}%)`;
  if (d.criteria.some((c) => !c.name.trim())) return 'Ogni criterio ha bisogno di un nome';
  return null;
}

/** Scales the weights so they sum to 100, in whole percent, keeping their proportions. */
export function rebalance(criteria: Criterion[]): Criterion[] {
  if (!criteria.length) return criteria;
  const sum = weightSum(criteria);
  const base = sum > 0 ? criteria.map((c) => (c.weight / sum) * 100) : criteria.map(() => 100 / criteria.length);
  const rounded = base.map(Math.floor);
  let rest = 100 - rounded.reduce((s, w) => s + w, 0);
  // Give the leftover points to the largest remainders.
  const order = base.map((w, i) => ({ i, r: w - Math.floor(w) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (rest <= 0) break;
    rounded[i]!++;
    rest--;
  }
  return criteria.map((c, i) => ({ ...c, weight: rounded[i]! }));
}

/** A new criterion with a unique id; weights are rebalanced to make room for it. */
export function addCriterion(criteria: Criterion[], name: string, description = ''): Criterion[] {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'criterio';
  let id = base;
  for (let n = 2; criteria.some((c) => c.id === id); n++) id = `${base}-${n}`;
  const even = Math.round(100 / (criteria.length + 1));
  return rebalance([...criteria, { id, name: name.trim(), description: description.trim(), weight: even }]);
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item!);
  return next;
}

export function isAnswered(q: Question, a: Answer | undefined): boolean {
  if (!a) return false;
  if (q.type === 'mc') return a.choice !== undefined;
  if (q.type === 'tf') return a.value !== undefined;
  return !!a.text?.trim();
}

export type GridState = 'answered' | 'flagged' | 'empty';

/** B5's grid: «Da rivedere» wins over «Risposta». */
export function gridStates(questions: Question[], answers: Record<string, Answer>, flagged: ReadonlySet<string>): GridState[] {
  return questions.map((q) => (flagged.has(q.id) ? 'flagged' : isAnswered(q, answers[q.id]) ? 'answered' : 'empty'));
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Whether a closed answer is right; null for open questions and unanswered ones. */
export function closedOutcome(q: Question, a: Answer | undefined): boolean | null {
  if (q.type === 'mc') return a?.choice === undefined ? null : a.choice === q.correctIndex;
  if (q.type === 'tf') return a?.value === undefined ? null : a.value === q.correct;
  return null;
}

/** Notes the study mode can read: markdown, PDFs and photos (not SVG, not index.md/checklist.md, not its own reports). */
export function studyKind(path: string): 'markdown' | 'pdf' | 'image' | null {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const parts = path.split('/');
  if (parts[1] === 'studio') return null;
  if (name === 'index.md' || name === 'checklist.md') return null;
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp)$/.test(name)) return 'image';
  return null;
}

/** YYYY-MM-DD in the device's time zone (the report's file name). */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const REPORT_FENCE = 'lore-study';

/** The data block of a saved report, or null for any other note. Same rule as the server's parseReport. */
export function parseReport(markdown: string): ReportData | null {
  const m = markdown.match(/```lore-study\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]!) as ReportData;
    return data && data.v === 1 && typeof data.date === 'string' && data.grade ? data : null;
  } catch {
    return null;
  }
}

/** A report's day (YYYY-MM-DD, the user's calendar): «oggi», «ieri», or «14 nov». */
export function dayLabel(date: string, now = new Date()): string {
  if (date === localDate(now)) return 'oggi';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (date === localDate(y)) return 'ieri';
  const [yy, mm, dd] = date.split('-').map(Number);
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${dd} ${months[(mm ?? 1) - 1]}${yy !== now.getFullYear() ? ` ${yy}` : ''}`;
}

export interface SavedReport {
  path: string;
  data: ReportData;
}

/** The last `n` sessions, oldest first, for the trend chart. */
export function trend(reports: SavedReport[], n = 5): SavedReport[] {
  return [...reports].sort((a, b) => a.path.localeCompare(b.path)).slice(-n);
}

/** "24/30", "8,5/10", "80%", "Buono". */
export function gradeText(g: { label: string; suffix: string }): string {
  return `${g.label}${g.suffix}`;
}

export function durationText(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

/** The criterion scores of an answer as a weighted 0…10 mean, or null without scores. */
export function answerScore(scores: Record<string, number> | undefined, criteria: Criterion[]): number | null {
  if (!scores) return null;
  const w = weightSum(criteria);
  if (!w) return null;
  return Math.round((criteria.reduce((s, c) => s + c.weight * (scores[c.id] ?? 0), 0) / w) * 10) / 10;
}

/** A finished session rebuilt from its saved report note (what the grade and answer screens show). */
export interface ReportSession {
  draft: StudyDraft;
  topics: string[];
  questions: Question[];
  answers: Record<string, Answer>;
  result: SessionResult;
}

const NO_ANSWER = '_Nessuna risposta_';
const FIELD = /^\*\*(Risposta|Soluzione|Punti attesi|Commento|Punteggio):\*\*\s?(.*)$/;
const SOURCE = /^Fonte: \[\[(.+?)\]\](?: · (.*))?$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The inverse of the server's renderReport: rebuilds the session from the note's
 * text plus its lore-study block, so a report saved on another device (or before
 * this device kept its own copy) opens like a fresh result. What the note doesn't
 * keep is lost: the underlined quotes of an open answer and the source excerpts.
 * Null when the note isn't a report or its questions don't match the data block.
 * `mapPath` turns the server's paths into the app's.
 */
export function sessionFromReport(markdown: string, project: string, mapPath: (wirePath: string) => string): ReportSession | null {
  const data = parseReport(markdown);
  if (!data) return null;
  const lines = markdown.slice(0, markdown.indexOf('```' + REPORT_FENCE)).split('\n');
  const qStart = lines.findIndex((l) => l === '## Domande');
  if (qStart < 0) return null;
  const head = lines.slice(0, qStart);

  // «**24/30** — headline», then the subline on the next paragraph.
  const gradeAt = head.findIndex((l) => l.startsWith('**') && l.includes('** — '));
  const subline = head.slice(gradeAt + 1).find((l) => l.trim() !== '') ?? '';

  const critAt = head.indexOf('## Criteri');
  const crits: { note: string }[] = [];
  if (critAt >= 0) {
    for (const l of head.slice(critAt + 1)) {
      const m = l.match(/^- \*\*(.+?)\*\* · \d+% — (?:—|[\d.,]+)\/10(?:\. (.*))?$/);
      if (m) crits.push({ note: m[2] ?? '' });
      else if (l.startsWith('>')) break;
    }
  }
  const criteria = data.criteria.map((c, i) => ({ id: `c${i}`, name: c.name, weight: c.weight, score: c.score, note: crits[i]?.note ?? '' }));

  // One block per «### N. ✅ prompt».
  const blocks: { prompt: string; body: string[] }[] = [];
  for (const l of lines.slice(qStart + 1)) {
    const h = l.match(/^### \d+\. \S+ (.*)$/);
    if (h) blocks.push({ prompt: h[1]!, body: [] });
    else blocks.at(-1)?.body.push(l);
  }
  if (blocks.length !== data.questions.length) return null;

  const questions: Question[] = [];
  const answers: Record<string, Answer> = {};
  const results: QuestionResult[] = [];

  blocks.forEach((b, i) => {
    const meta = data.questions[i]!;
    // A prompt can run over several lines, up to the blank one.
    let at = 0;
    let prompt = b.prompt;
    while (at < b.body.length && b.body[at]!.trim() !== '') prompt += '\n' + b.body[at++];

    const options: { text: string; correct: boolean }[] = [];
    const fields: Record<string, string[]> = {};
    let source: { path: string; locator: string } | null = null;
    let field = '';
    for (const l of b.body.slice(at)) {
      const f = l.match(FIELD);
      const src = l.match(SOURCE);
      if (f) {
        field = f[1]!;
        fields[field] = [f[2]!];
      } else if (src) {
        field = '';
        source = { path: src[1]!, locator: src[2] ?? '' };
      } else if (field) fields[field]!.push(l);
      else {
        const o = l.match(/^[A-D]\. (.*?)( ✓)?$/);
        if (o) options.push({ text: o[1]!, correct: !!o[2] });
      }
    }
    const get = (k: string) => (fields[k] ?? []).join('\n').trim();

    const base = { id: meta.id, topic: meta.topic, prompt: prompt.trim(), source: source ? { path: mapPath(source.path), locator: source.locator, excerpt: '' } : null };
    const given = get('Risposta');
    const answered = given !== '' && given !== NO_ANSWER;
    let q: Question;
    if (meta.type === 'mc') {
      q = { ...base, type: 'mc', options: options.map((o) => o.text), correctIndex: Math.max(0, options.findIndex((o) => o.correct)), explanation: get('Soluzione') };
      const letter = answered ? 'ABCD'.indexOf(given[0]!) : -1;
      if (letter >= 0) answers[meta.id] = { choice: letter };
    } else if (meta.type === 'tf') {
      const solution = get('Soluzione');
      q = { ...base, type: 'tf', correct: solution.startsWith('Vero'), explanation: solution.replace(/^(Vero|Falso)\. ?/, '') };
      const value = given.startsWith('Vero') ? true : given.startsWith('Falso') ? false : undefined;
      if (answered && value !== undefined) {
        const motivation = given.replace(/^(Vero|Falso)( — )?/, '').trim();
        answers[meta.id] = { value, ...(motivation ? { motivation } : {}) };
      }
    } else {
      q = { ...base, type: 'open', expectedPoints: get('Punti attesi').split('\n').map((p) => p.replace(/^- /, '').trim()).filter(Boolean) };
      if (answered) answers[meta.id] = { text: given };
    }
    questions.push(q);

    const scoreLine = get('Punteggio');
    const criterionScores: Record<string, number> = {};
    criteria.forEach((c) => {
      const m = scoreLine.match(new RegExp(`${escapeRegExp(c.name)} (\\d+(?:[.,]\\d+)?)`));
      if (m) criterionScores[c.id] = Number(m[1]!.replace(',', '.'));
    });
    const comment = get('Commento');
    results.push({
      questionId: meta.id,
      status: meta.status as QuestionResult['status'],
      score: meta.score,
      ...(Object.keys(criterionScores).length ? { criterionScores } : {}),
      ...(comment ? { comment } : {}),
    });
  });

  const draft: StudyDraft = {
    ...defaultDraft(project),
    sources: data.sources.map(mapPath),
    criteria: criteria.map((c) => ({ id: c.id, name: c.name, description: '', weight: c.weight })),
    scale: data.scale,
    ...(data.preset ? { presetName: data.preset } : {}),
  };
  const result: SessionResult = {
    grade: data.grade,
    scale: data.scale,
    headline: data.headline,
    subline,
    closedCorrect: data.closedCorrect,
    closedTotal: data.closedTotal,
    openAverage: data.openAverage,
    durationSec: data.durationSec,
    criteria,
    questions: results,
    topics: data.topics,
  };
  return { draft, topics: data.topics, questions, answers, result };
}

// ─── Studio tab (A1): progress read back from the saved reports ──────────────

function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y!, m! - 1, d! + days));
}

/** Days in a row with at least one session, ending today (or yesterday: today's still open). */
export function streakDays(dates: string[], now = new Date()): number {
  const days = new Set(dates);
  const today = localDate(now);
  let day = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

export interface WeekDay {
  label: string;
  date: string;
  done: boolean;
  today: boolean;
  future: boolean;
}

/** Monday to Sunday of this week, with the days that had a session. */
export function thisWeek(dates: string[], now = new Date()): WeekDay[] {
  const days = new Set(dates);
  const today = localDate(now);
  const monday = shiftDay(today, -((now.getDay() + 6) % 7));
  return ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((label, i) => {
    const date = shiftDay(monday, i);
    return { label, date, done: days.has(date), today: date === today, future: date > today };
  });
}

export interface TopicMastery {
  topic: string;
  /** 0…1: the mean score of its questions, the latest sessions counting more. */
  score: number;
  questions: number;
}

/** How each topic is going across the saved sessions, weakest first. */
export function topicMastery(reports: SavedReport[]): TopicMastery[] {
  const byTopic = new Map<string, { sum: number; weight: number; questions: number }>();
  // Oldest first: each newer session weighs a bit more than the one before.
  [...reports]
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach((r, i) => {
      const w = 1 + i * 0.5;
      for (const q of r.data.questions) {
        const topic = q.topic?.trim();
        if (!topic) continue;
        const t = byTopic.get(topic) ?? { sum: 0, weight: 0, questions: 0 };
        t.sum += q.score * w;
        t.weight += w;
        t.questions++;
        byTopic.set(topic, t);
      }
    });
  return [...byTopic.entries()].map(([topic, t]) => ({ topic, score: t.sum / t.weight, questions: t.questions })).sort((a, b) => a.score - b.score);
}

export function masteryLabel(score: number): string {
  if (score >= 0.8) return 'Padroneggiato';
  if (score >= 0.5) return 'In crescita';
  return 'Da rinforzare';
}

/** 0…1: the mean of the last three grades (how ready the notes look). */
export function readiness(reports: SavedReport[]): number | null {
  const last = trend(reports, 3);
  if (!last.length) return null;
  return last.reduce((s, r) => s + r.data.grade.fraction, 0) / last.length;
}

/** The coach's line under the hero: progress in the user's own numbers, or null. */
export function coachMessage(reports: SavedReport[], topics: TopicMastery[]): string | null {
  const recent = trend(reports, 5);
  if (recent.length >= 2) {
    const first = recent[0]!.data.grade;
    const last = recent.at(-1)!.data.grade;
    const weakest = topics[0];
    const focus = weakest && weakest.score < 0.6 ? ` Oggi conviene insistere su ${weakest.topic}.` : '';
    if (last.fraction > first.fraction + 0.02) return `In ${recent.length} sessioni sei passato da ${gradeText(first)} a ${gradeText(last)}.${focus}`;
    if (last.fraction < first.fraction - 0.02) return `L’ultima è andata meno bene (${gradeText(last)}): niente panico, si recupera ripassando.${focus}`;
    return `Stabile su ${gradeText(last)}.${focus || ' Prova a spingere un po’ di più.'}`;
  }
  if (recent.length === 1) return `Prima sessione: ${gradeText(recent[0]!.data.grade)}. Da qui si misura il progresso.`;
  return null;
}
