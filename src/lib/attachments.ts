export type AttachmentKind = 'image' | 'pdf' | 'office';
/** The Office application an Office document belongs to (for its icon). */
export type OfficeApp = 'word' | 'excel' | 'powerpoint';

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const OFFICE = /\.(docx|xlsx|pptx)$/i;
const OFFICE_APPS: Record<string, OfficeApp> = { docx: 'word', xlsx: 'excel', pptx: 'powerpoint' };

/**
 * What an attachment is by its extension (the server stores png, jpg, gif, webp, svg, pdf and the
 * Office documents docx, xlsx, pptx), or null for notes and anything else.
 */
export function attachmentKind(path: string): AttachmentKind | null {
  if (IMAGE.test(path)) return 'image';
  if (/\.pdf$/i.test(path)) return 'pdf';
  return OFFICE.test(path) ? 'office' : null;
}

/** Word, Excel or PowerPoint for a .docx, .xlsx or .pptx; null for anything else (legacy .doc/.xls/.ppt included). */
export function officeApp(path: string): OfficeApp | null {
  const m = OFFICE.exec(path);
  return m ? OFFICE_APPS[m[1]!.toLowerCase()]! : null;
}

/** A PDF or an Office document: shown as a page (in-app on iOS) or a card that opens it, never inline. */
export function isDocumentAttachment(path: string): boolean {
  const kind = attachmentKind(path);
  return kind === 'pdf' || kind === 'office';
}

/** What a document is called in messages: «il PDF», «il documento Word», «il foglio Excel», «la presentazione PowerPoint». */
export function documentLabel(path: string): string {
  const app = officeApp(path);
  if (app === 'word') return 'il documento Word';
  if (app === 'excel') return 'il foglio Excel';
  if (app === 'powerpoint') return 'la presentazione PowerPoint';
  return attachmentKind(path) === 'pdf' ? 'il PDF' : 'il file';
}
