/**
 * Incremental server-sent events parser: feed it text as it arrives, in chunks
 * of any size (a chunk may end in the middle of a line), and it calls back one
 * event per blank-line-terminated block. Comment lines (`: ping`) are ignored.
 */
export interface SSEMessage {
  event: string;
  data: string;
}

export function createSSEParser(onMessage: (m: SSEMessage) => void) {
  let buffer = '';
  let event = '';
  let data: string[] = [];

  const dispatch = () => {
    if (data.length) onMessage({ event: event || 'message', data: data.join('\n') });
    event = '';
    data = [];
  };

  const line = (raw: string) => {
    const l = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (l === '') return dispatch();
    if (l.startsWith(':')) return;
    const i = l.indexOf(':');
    const field = i === -1 ? l : l.slice(0, i);
    const value = i === -1 ? '' : l.slice(i + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    },
    /** Flushes a final event that wasn't followed by a blank line. */
    end() {
      if (buffer) line(buffer);
      buffer = '';
      dispatch();
    },
  };
}
