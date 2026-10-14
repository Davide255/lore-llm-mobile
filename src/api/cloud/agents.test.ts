import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyAudit, fromScope, refOf, toAgentFields, toPatch, toScope, writtenByAgent, type AuditRow, type Writer } from './agents.ts';

test('scope round-trips between the app and the Worker', () => {
  assert.equal(toScope(['*']), '*');
  assert.equal(toScope(['Athly', 'Sito']), 'Athly/*,Sito/*');
  assert.deepEqual(fromScope('*'), ['*']);
  assert.deepEqual(fromScope('Athly/*,Sito/*'), ['Athly', 'Sito']);
  assert.deepEqual(fromScope('Athly/*,*'), ['*']);
});

test('agent rows map to the app shape', () => {
  const row = { agent_id: 'a1', name: 'Codex lavoro', agent_type: 'codex', project_scope: 'Athly/*', access_level: 'read_write', created_at: '2026-10-14T10:00:00.000Z' };
  assert.deepEqual(toAgentFields(row), {
    id: 'a1',
    name: 'Codex lavoro',
    kind: 'codex',
    permission: 'read-write',
    scope: ['Athly'],
    createdAt: '2026-10-14T10:00:00.000Z',
  });
  // Rows from before agent types, or unknown types, are Claude.
  assert.equal(toAgentFields({ ...row, agent_type: undefined }).kind, 'claude');
  assert.equal(toAgentFields({ ...row, agent_type: 'cursor' }).kind, 'claude');
  assert.equal(toAgentFields({ ...row, access_level: 'read_only' }).permission, 'read');
});

test('patches only carry the fields that changed', () => {
  assert.deepEqual(toPatch({ permission: 'read' }), { access_level: 'read_only' });
  assert.deepEqual(toPatch({ kind: 'codex', scope: ['*'], name: 'X' }), { name: 'X', agent_type: 'codex', project_scope: '*' });
});

test('audit rows give the latest writer per path, incrementally', () => {
  const rows: AuditRow[] = [
    { log_id: 3, timestamp: '2026-10-14T10:03:00.000Z', agent_id: 'b', action: 'UPDATE', target_path: 'P/a.md' },
    { log_id: 1, timestamp: '2026-10-14T10:01:00.000Z', agent_id: 'a', action: 'CREATE', target_path: 'P/a.md' },
    { log_id: 2, timestamp: '2026-10-14T10:02:00.000Z', agent_id: 'a', action: 'CREATE', target_path: 'P/b.md' },
  ];
  const writers = new Map<string, Writer>();
  assert.equal(applyAudit(writers, rows), 3);
  assert.equal(writers.get('P/a.md')?.agentId, 'b');
  assert.equal(writers.get('P/b.md')?.agentId, 'a');
  // Only rows after `after` apply.
  const fresh: AuditRow = { log_id: 4, timestamp: '2026-10-14T10:04:00.000Z', agent_id: 'c', action: 'UPDATE', target_path: 'P/b.md' };
  assert.equal(applyAudit(writers, [fresh, ...rows], 3), 4);
  assert.equal(writers.get('P/b.md')?.agentId, 'c');
  assert.equal(applyAudit(writers, rows, 4), 4);
});

test('a version is the agent’s only if it was uploaded with its audit row', () => {
  const w = { agentId: 'a', at: '2026-10-14T10:00:05.000Z' };
  assert.equal(writtenByAgent('2026-10-14T10:00:04.000Z', w), true);
  // Saved later from one of the user's apps.
  assert.equal(writtenByAgent('2026-10-14T11:00:00.000Z', w), false);
  assert.equal(writtenByAgent('2026-10-14T10:00:04.000Z', undefined), false);
});

test('revoked agents keep a readable identity', () => {
  assert.deepEqual(refOf({ a: { name: 'Claude', kind: 'claude' } }, 'a'), { id: 'a', name: 'Claude', kind: 'claude' });
  assert.deepEqual(refOf({}, 'gone'), { id: 'gone', name: 'Agente revocato', kind: null });
});
