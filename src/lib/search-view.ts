import type { SearchHit, SearchSnippet } from '@/api';

/** Markdown that opens a line (heading, list, task, quote, numbered item): noise in a snippet. */
const LEAD = /^(\s*(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|>\s*|\d+[.)]\s+))+/;

/** The snippet without the line's leading markdown, highlights shifted to match. */
export function cleanSnippet(s: SearchSnippet): SearchSnippet {
  const ellipsis = s.text.startsWith('…') ? 1 : 0;
  const m = LEAD.exec(s.text.slice(ellipsis));
  if (!m) return s;
  const cut = m[0].length;
  const text = s.text.slice(0, ellipsis) + s.text.slice(ellipsis + cut);
  const highlights = s.highlights
    .map(([a, b]): [number, number] => [a < ellipsis ? a : Math.max(ellipsis, a - cut), b < ellipsis ? b : Math.max(ellipsis, b - cut)])
    .filter(([a, b]) => b > a);
  return { text, highlights };
}

/** A note's display title: its file name without `.md`. */
export function noteTitle(name: string): string {
  return name.replace(/\.md$/i, '');
}

/** Folders between the project and the file (`P/a/b/n.md` → `a / b`), '' at the project root. */
export function folderTrail(path: string): string {
  const parts = path.split('/');
  return parts.slice(1, -1).join(' / ');
}

/** Hits grouped by project, groups in the order their first hit ranks. */
export function groupByProject(hits: SearchHit[]): { project: string; hits: SearchHit[] }[] {
  const groups = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const g = groups.get(h.project);
    if (g) g.push(h);
    else groups.set(h.project, [h]);
  }
  return [...groups].map(([project, hits]) => ({ project, hits }));
}

/** The snippet worth showing under a hit, or null when it only repeats the note's name (a match on the path). */
export function visibleSnippet(hit: Pick<SearchHit, 'name' | 'snippet'>): SearchSnippet | null {
  const s = cleanSnippet(hit.snippet);
  const line = s.text.trim().toLowerCase();
  return line === noteTitle(hit.name).toLowerCase() || line === hit.name.toLowerCase() || !line ? null : s;
}
