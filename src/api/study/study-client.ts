import { fetch } from 'expo/fetch';

import { API_URL } from '@/api/cloud/cloud-client';
import { KBError } from '@/api/types';
import { idToken } from '@/auth/session';
import { DEMO } from '@/demo/demo';
import { runStudyDemo } from '@/demo/study-demo';
import { createSSEParser } from '@/lib/sse';
import type { GenerateRequest, GradeRequest, StudyEvent } from './types';

/**
 * Study mode over the Lore API: `POST /v1/study-mode/generate|grade` on the
 * Worker, which passes the study Lambda's server-sent events through (contract:
 * lore-llm docs/STUDY_API.md). `expo/fetch` is imported by name so the body can
 * be read as a stream on every platform; React Native's own fetch can't.
 *
 * Resolves once the stream ends with `done`; rejects with a KBError on an HTTP
 * error, a dropped connection, or an `error` event (after delivering it).
 */
export async function streamStudy(
  op: 'generate' | 'grade',
  body: GenerateRequest | GradeRequest,
  onEvent: (e: StudyEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (DEMO) return runStudyDemo(op, body, onEvent, signal);

  const token = await idToken();
  if (!token) throw new KBError('invalid', 'Accesso richiesto');

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${API_URL}/v1/study-mode/${op}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new KBError('network', 'Connessione assente: riprova quando sei online');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw httpError(res.status, data.error);
  }
  if (!res.body) throw new KBError('network', 'Risposta vuota dal server');

  let finished = false;
  let failure: KBError | null = null;
  const parser = createSSEParser((m) => {
    let data: unknown;
    try {
      data = JSON.parse(m.data);
    } catch {
      return;
    }
    const e = { event: m.event, data } as StudyEvent;
    if (e.event === 'done') finished = true;
    if (e.event === 'error') {
      finished = true;
      failure = new KBError('invalid', errorMessage(e.data.code, e.data.message));
    }
    onEvent(e);
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new KBError('network', 'Connessione interrotta: riprova');
  }
  if (failure) throw failure;
  if (!finished) throw new KBError('network', 'Connessione interrotta prima della fine: riprova');
}

function httpError(status: number, error?: string): KBError {
  if (status === 401) return new KBError('invalid', 'Sessione non valida: esci e accedi di nuovo');
  if (status === 503) return new KBError('invalid', 'La modalità studio non è ancora attiva su questo server');
  if (status === 413) return new KBError('invalid', 'Sessione troppo grande da inviare');
  if (status === 400) return new KBError('invalid', `Richiesta non valida${error ? `: ${error}` : ''}`);
  return new KBError('network', `Servizio non disponibile (${status}): riprova tra poco`);
}

/** The Lambda's error codes, in the app's words. */
function errorMessage(code: string, message: string): string {
  switch (code) {
    case 'unauthorized':
      return 'Sessione non valida: esci e accedi di nuovo';
    case 'forbidden':
      return 'Non hai accesso a uno degli appunti scelti';
    case 'not_found':
      return 'Uno degli appunti scelti non esiste più';
    case 'too_large':
      return 'Gli appunti scelti sono troppo grandi: togline qualcuno';
    case 'refusal':
      return 'L’AI non ha potuto lavorare su questi appunti';
    case 'incomplete':
      return 'L’AI non ha completato il lavoro: riprova';
    case 'invalid':
      return /None of the selected files/.test(message) ? 'Nessuno degli appunti scelti si può leggere' : 'Richiesta non valida';
    default:
      return 'Qualcosa non ha funzionato: riprova';
  }
}
