export type AttachmentKind = 'image' | 'pdf';

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

/** What an attachment is by its extension (the server stores png, jpg, gif, webp, svg and pdf), or null for notes and anything else. */
export function attachmentKind(path: string): AttachmentKind | null {
  if (IMAGE.test(path)) return 'image';
  return /\.pdf$/i.test(path) ? 'pdf' : null;
}
