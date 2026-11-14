import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSSEParser } from './sse.ts';
import {
  addCriterion,
  dayLabel,
  answerScore,
  defaultDraft,
  DEFAULT_CRITERIA,
  estimatedMinutes,
  gridStates,
  moveItem,
  parseReport,
  rebalance,
  stepError,
  studyKind,
  totalQuestions,
  trend,
  wordCount,
} from './study-model.ts';

describe('sse parser', () => {
  it('splits events across arbitrary chunk boundaries and skips comments', () => {
    const got: { event: string; data: string }[] = [];
    const p = createSSEParser((m) => got.push(m));
    const stream = ': ping\n\nevent: question\ndata: {"index":1}\n\nevent: done\r\ndata: {}\r\n\r\n';
    for (let i = 0; i < stream.length; i += 3) p.push(stream.slice(i, i + 3));
    p.end();
    assert.deepEqual(got, [
      { event: 'question', data: '{"index":1}' },
      { event: 'done', data: '{}' },
    ]);
  });

  it('flushes a last event without a trailing blank line', () => {
    const got: string[] = [];
    const p = createSSEParser((m) => got.push(m.event));
    p.push('event: error\ndata: {}');
    p.end();
    assert.deepEqual(got, ['error']);
  });
});

describe('setup draft', () => {
  it('defaults to the design: 4 + 4 + 2 questions, ~15 minutes, four criteria at 100%', () => {
    const d = defaultDraft('Analisi');
    assert.equal(totalQuestions(d), 10);
    assert.equal(estimatedMinutes(d), 15);
    assert.deepEqual(DEFAULT_CRITERIA.map((c) => c.weight), [40, 30, 20, 10]);
  });

  it('validates each step', () => {
    const d = defaultDraft('P');
    assert.equal(stepError(d, 'sources'), 'Scegli almeno un appunto');
    assert.equal(stepError({ ...d, sources: ['P/a.md'] }, 'sources'), null);
    assert.equal(stepError({ ...d, enabled: { mc: false, tf: false, open: false } }, 'types'), 'Scegli almeno una domanda');
    assert.match(stepError({ ...d, counts: { mc: 20, tf: 20, open: 0 } }, 'types')!, /30/);
    assert.equal(stepError({ ...d, criteria: [] }, 'criteria'), 'Le risposte aperte hanno bisogno di almeno un criterio');
    assert.equal(stepError({ ...d, criteria: [], enabled: { mc: true, tf: true, open: false } }, 'criteria'), null);
    assert.match(stepError({ ...d, criteria: d.criteria.map((c) => ({ ...c, weight: 10 })) }, 'criteria')!, /ora 40%/);
  });

  it('rebalances weights to 100 keeping proportions', () => {
    const c = (w: number[]) => w.map((weight, i) => ({ id: `c${i}`, name: 'x', description: '', weight }));
    assert.deepEqual(rebalance(c([1, 1, 1])).map((x) => x.weight), [34, 33, 33]);
    assert.deepEqual(rebalance(c([40, 30, 20, 10, 25])).map((x) => x.weight), [32, 24, 16, 8, 20]);
    assert.deepEqual(rebalance(c([0, 0])).map((x) => x.weight), [50, 50]);
  });

  it('adds criteria with unique ids', () => {
    const one = addCriterion(DEFAULT_CRITERIA, 'Rigore');
    assert.equal(one.at(-1)!.id, 'rigore-2');
    assert.equal(one.reduce((s, c) => s + c.weight, 0), 100);
    assert.equal(addCriterion([], 'Uso del linguaggio').at(-1)!.id, 'uso-del-linguaggio');
  });

  it('moves list items', () => {
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  });

  it('lists only readable notes', () => {
    assert.equal(studyKind('P/a.md'), 'markdown');
    assert.equal(studyKind('P/x/lezione.PDF'), 'pdf');
    assert.equal(studyKind('P/lavagna.jpg'), 'image');
    assert.equal(studyKind('P/logo.svg'), null);
    assert.equal(studyKind('P/index.md'), null);
    assert.equal(studyKind('P/checklist.md'), null);
    assert.equal(studyKind('P/studio/2026-11-14-serie.md'), null);
  });
});

describe('session', () => {
  const qs = [
    { id: 'q1', type: 'mc' as const, topic: '', prompt: '', options: ['a', 'b', 'c', 'd'], correctIndex: 1, explanation: '', source: null },
    { id: 'q2', type: 'tf' as const, topic: '', prompt: '', correct: false, explanation: '', source: null },
    { id: 'q3', type: 'open' as const, topic: '', prompt: '', expectedPoints: [], source: null },
  ];

  it('marks the summary grid, flagged first', () => {
    assert.deepEqual(gridStates(qs, { q1: { choice: 0 }, q3: { text: '  ' } }, new Set(['q2'])), ['answered', 'flagged', 'empty']);
  });

  it('counts words and weights an answer', () => {
    assert.equal(wordCount('  Sia ∑ aₙ  a termini\npositivi '), 6);
    assert.equal(wordCount(''), 0);
    assert.equal(answerScore({ rigore: 5, completezza: 6, chiarezza: 8, esempi: 9 }, DEFAULT_CRITERIA), 6.3);
    assert.equal(answerScore(undefined, DEFAULT_CRITERIA), null);
  });
});

describe('reports', () => {
  const report = (date: string, label: string) =>
    `# Sessione\n\ntesto\n\n\`\`\`lore-study\n${JSON.stringify({ v: 1, date, grade: { label, suffix: '/30', fraction: 0.8 }, scale: '30', headline: 'x', topics: ['Serie'] })}\n\`\`\`\n`;

  it('reads the data block written by the server and ignores other notes', () => {
    assert.equal(parseReport(report('2026-11-14', '24'))!.grade.label, '24');
    assert.equal(parseReport('# Nota'), null);
    assert.equal(parseReport('```lore-study\n{oops}\n```'), null);
  });

  it('labels report days', () => {
    const now = new Date(2026, 10, 14, 9);
    assert.equal(dayLabel('2026-11-14', now), 'oggi');
    assert.equal(dayLabel('2026-11-13', now), 'ieri');
    assert.equal(dayLabel('2026-11-02', now), '2 nov');
    assert.equal(dayLabel('2025-12-31', now), '31 dic 2025');
  });

  it('keeps the last five sessions, oldest first', () => {
    const rs = ['10', '11', '12', '13', '14', '09'].map((d) => ({ path: `P/studio/2026-11-${d}-x.md`, data: parseReport(report(`2026-11-${d}`, d))! }));
    assert.deepEqual(trend(rs).map((r) => r.data.date.slice(-2)), ['10', '11', '12', '13', '14']);
  });
});
