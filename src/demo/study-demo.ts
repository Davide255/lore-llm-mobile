import { API_URL } from '@/api/cloud/cloud-client';
import type { Answer, GenerateRequest, GradeRequest, Question, QuestionResult, ReportData, SessionResult, StudyEvent } from '@/api/study/types';

/**
 * Demo of the study Lambda (EXPO_PUBLIC_DEMO=1): the same events, in the same
 * order, with made-up questions on series. Closed answers are graded for real,
 * open ones get a plausible fixed grade, and the report is written to the demo
 * Worker so the Studio tab can list it. Only the shape matters here.
 */
export async function runStudyDemo(
  op: 'generate' | 'grade',
  body: GenerateRequest | GradeRequest,
  onEvent: (e: StudyEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      });
    });
  if (op === 'generate') return generate(body as GenerateRequest, onEvent, wait);
  return grade(body as GradeRequest, onEvent, wait);
}

type Wait = (ms: number) => Promise<void>;

const MC: Omit<Extract<Question, { type: 'mc' }>, 'id' | 'source'>[] = [
  { type: 'mc', topic: 'Serie', prompt: 'Quale di queste serie converge?', options: ['∑ 1/n', '∑ 1/n²', '∑ (−1)ⁿ', '∑ n/(n+1)'], correctIndex: 1, explanation: 'È una serie armonica generalizzata con p = 2 > 1.' },
  { type: 'mc', topic: 'Limiti', prompt: 'Quanto vale lim (1 + 1/n)ⁿ per n → ∞?', options: ['1', 'e', '∞', '0'], correctIndex: 1, explanation: 'È la definizione del numero di Nepero.' },
  { type: 'mc', topic: 'Limiti', prompt: 'Quanto vale lim sin x / x per x → 0?', options: ['0', '∞', '1', 'Non esiste'], correctIndex: 2, explanation: 'Limite notevole.' },
  { type: 'mc', topic: 'Serie', prompt: 'La serie geometrica ∑ qⁿ converge se e solo se:', options: ['q < 1', '|q| < 1', '|q| ≤ 1', 'q > 0'], correctIndex: 1, explanation: 'Converge per |q| < 1 a 1/(1 − q).' },
];
const TF: Omit<Extract<Question, { type: 'tf' }>, 'id' | 'source'>[] = [
  { type: 'tf', topic: 'Serie', prompt: 'Se aₙ → 0, allora la serie ∑ aₙ converge.', correct: false, explanation: 'È solo una condizione necessaria: la serie armonica diverge.' },
  { type: 'tf', topic: 'Criteri', prompt: 'Il criterio della radice è almeno potente quanto quello del rapporto.', correct: true, explanation: 'Se il rapporto ha limite, la radice ha lo stesso limite.' },
  { type: 'tf', topic: 'Serie', prompt: 'Una serie a termini positivi o converge o diverge a +∞.', correct: true, explanation: 'Le somme parziali sono monotone crescenti.' },
  { type: 'tf', topic: 'Limiti', prompt: 'Una successione limitata è sempre convergente.', correct: false, explanation: '(−1)ⁿ è limitata ma non converge.' },
];
const OPEN: Omit<Extract<Question, { type: 'open' }>, 'id' | 'source'>[] = [
  { type: 'open', topic: 'Criteri', prompt: 'Enuncia il criterio del rapporto e spiega perché non è conclusivo quando il limite vale 1.', expectedPoints: ['Termini positivi', 'L < 1 converge, L > 1 diverge', 'Con L = 1 ∑ 1/n e ∑ 1/n² danno entrambe 1'] },
  { type: 'open', topic: 'Serie', prompt: 'Dimostra che la serie armonica diverge.', expectedPoints: ['Raggruppamento a potenze di 2', 'Ogni gruppo vale almeno 1/2'] },
];

async function generate(req: GenerateRequest, emit: (e: StudyEvent) => void, wait: Wait) {
  for (const s of req.sources) {
    const kind = s.path.endsWith('.md') ? 'markdown' : s.path.endsWith('.pdf') ? 'pdf' : 'image';
    emit({ event: 'file', data: { path: s.path, status: 'loading', kind } });
    await wait(500);
    emit({ event: 'file', data: { path: s.path, status: 'ready', kind, bytes: 4200 } });
  }
  await wait(600);
  emit({ event: 'topics', data: { topics: ['Limiti notevoli', 'Criterio del rapporto', 'Serie geometrica'] } });
  const pick = <T,>(bank: T[], n: number) => Array.from({ length: n }, (_, i) => bank[i % bank.length]!);
  const all = [...pick(MC, req.mix.mc), ...pick(TF, req.mix.tf), ...pick(OPEN, req.mix.open)];
  const first = req.sources[0]?.path ?? '';
  for (const [i, q] of all.entries()) {
    await wait(350);
    const source = req.citeSource && first ? { path: first, locator: i % 2 ? 'p. 6' : 'Condizione necessaria', excerpt: '' } : null;
    emit({ event: 'question', data: { question: { ...q, id: `q${i + 1}`, source } as Question, index: i + 1, total: all.length } });
  }
  emit({ event: 'done', data: { count: all.length } });
}

async function grade(req: GradeRequest, emit: (e: StudyEvent) => void, wait: Wait) {
  const results: QuestionResult[] = [];
  const empty = (q: Question, a?: Answer) => (q.type === 'mc' ? a?.choice === undefined : q.type === 'tf' ? a?.value === undefined : !a?.text?.trim());
  const fake = (seed: number) => Object.fromEntries(req.criteria.map((c, i) => [c.id, Math.min(10, 5 + ((seed + i * 3) % 5))]));
  const weighted = (s: Record<string, number>) => req.criteria.reduce((t, c) => t + c.weight * (s[c.id] ?? 0), 0) / 100 / 10;

  for (const [i, q] of req.questions.entries()) {
    const a = req.answers[q.id];
    let r: QuestionResult;
    if (empty(q, a)) r = { questionId: q.id, status: 'empty', score: 0 };
    else if (q.type === 'mc') r = { questionId: q.id, status: a!.choice === q.correctIndex ? 'correct' : 'wrong', score: a!.choice === q.correctIndex ? 1 : 0 };
    else if (q.type === 'tf' && !a!.motivation?.trim()) r = { questionId: q.id, status: a!.value === q.correct ? 'correct' : 'wrong', score: a!.value === q.correct ? 1 : 0 };
    else {
      await wait(900);
      const scores = fake(i);
      const text = q.type === 'open' ? a!.text! : a!.motivation!;
      const quote = text.split(/[.,;]/)[0]!.trim();
      const base = q.type === 'tf' ? (a!.value === q.correct ? 0.7 : 0) + 0.3 * weighted(scores) : weighted(scores);
      r = {
        questionId: q.id,
        status: base >= 0.85 ? 'correct' : base >= 0.35 ? 'partial' : 'wrong',
        score: Math.round(base * 1000) / 1000,
        criterionScores: scores,
        comment: 'Hai indicato i punti giusti ma non hai concluso: rivedi le ipotesi nella fonte citata.',
        highlights: quote ? [{ quote, kind: 'good' }] : [],
      };
    }
    results.push(r);
    emit({ event: 'graded', data: r });
  }

  const fraction = results.reduce((s, r) => s + r.score, 0) / results.length;
  const closed = req.questions.filter((q) => q.type !== 'open');
  const open = req.questions.filter((q) => q.type === 'open');
  const closedCorrect = closed.filter((q) => results.find((r) => r.questionId === q.id)!.score >= 0.7).length;
  const label =
    req.scale === '30' ? String(Math.round(fraction * 30)) : req.scale === '10' ? (Math.round(fraction * 100) / 10).toString().replace('.', ',') : req.scale === 'percent' ? String(Math.round(fraction * 100)) : fraction >= 0.7 ? 'Buono' : 'Sufficiente';
  const suffix = req.scale === '30' ? '/30' : req.scale === '10' ? '/10' : req.scale === 'percent' ? '%' : '';
  const result: SessionResult = {
    grade: { fraction, label, suffix },
    scale: req.scale,
    headline: 'Buona base, poco rigore',
    subline: 'Le chiuse sono quasi perfette; nelle aperte mancano le ipotesi.',
    closedCorrect,
    closedTotal: closed.length,
    openAverage: open.length ? Math.round((open.reduce((s, q) => s + results.find((r) => r.questionId === q.id)!.score, 0) / open.length) * 100) / 10 : null,
    durationSec: req.durationSec,
    criteria: req.criteria.map((c, i) => ({ id: c.id, name: c.name, weight: c.weight, score: open.length ? 5 + ((i * 3) % 5) : null, note: i === 0 ? 'Criterio del rapporto enunciato senza «termini positivi».' : '' })),
    questions: results,
    topics: [...new Set(req.questions.map((q) => q.topic))],
  };
  await wait(400);
  emit({ event: 'result', data: result });

  const path = `${req.project}/studio/${req.date}-${(result.topics[0] ?? 'sessione').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
  const data: ReportData = {
    v: 1,
    date: req.date,
    grade: { label, suffix, fraction: Math.round(fraction * 1000) / 1000 },
    scale: req.scale,
    headline: result.headline,
    topics: result.topics,
    closedCorrect,
    closedTotal: closed.length,
    openAverage: result.openAverage,
    durationSec: req.durationSec,
    criteria: result.criteria.map((c) => ({ name: c.name, weight: c.weight, score: c.score })),
    questions: req.questions.map((q) => ({ id: q.id, type: q.type, topic: q.topic, status: results.find((r) => r.questionId === q.id)!.status, score: results.find((r) => r.questionId === q.id)!.score })),
    sources: req.sources.map((s) => s.path),
  };
  const md = `# Sessione di studio · ${req.date}\n\n**${label}${suffix}** — ${result.headline}\n\n\`\`\`lore-study\n${JSON.stringify(data)}\n\`\`\`\n`;
  const q = new URLSearchParams({ path });
  if (req.owner) q.set('owner', req.owner);
  const res = await globalThis.fetch(`${API_URL}/v1/file?${q}`, {
    method: 'PUT',
    headers: { authorization: 'Bearer demo', 'content-type': 'application/json' },
    body: JSON.stringify({ content: md, overwrite: true }),
  });
  emit(res.ok ? { event: 'saved', data: { path } } : { event: 'save_failed', data: { message: 'Report non salvato' } });
  emit({ event: 'done', data: {} });
}
