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
  presetName?: string;
}

export interface StudyPreset {
  name: string;
  instructions: string;
  criteria: Criterion[];
  scale: Scale;
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
