import { SymbolView, type AndroidSymbol, type SymbolWeight } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { ProjectIcon } from '@/api';

/**
 * One semantic name → SF Symbol on iOS, Material Symbol on Android/web.
 * Keeps screens free of platform-specific glyph names.
 */
export const icons = {
  folder: { sf: 'folder', md: 'folder' },
  folderFill: { sf: 'folder.fill', md: 'folder' },
  doc: { sf: 'doc.text', md: 'description' },
  checklist: { sf: 'checklist', md: 'checklist' },
  index: { sf: 'sparkles', md: 'auto_awesome' },
  lock: { sf: 'lock.fill', md: 'lock' },
  chevronRight: { sf: 'chevron.right', md: 'chevron_right' },
  chevronUpDown: { sf: 'chevron.up.chevron.down', md: 'unfold_more' },
  add: { sf: 'plus', md: 'add' },
  addCircle: { sf: 'plus.circle', md: 'add_circle' },
  more: { sf: 'ellipsis', md: 'more_horiz' },
  share: { sf: 'square.and.arrow.up', md: 'ios_share' },
  search: { sf: 'magnifyingglass', md: 'search' },
  history: { sf: 'clock.arrow.circlepath', md: 'history' },
  close: { sf: 'xmark', md: 'close' },
  bolt: { sf: 'bolt', md: 'bolt' },
  boltFill: { sf: 'bolt.fill', md: 'bolt' },
  settings: { sf: 'gearshape', md: 'settings' },
  settingsFill: { sf: 'gearshape.fill', md: 'settings' },
  tune: { sf: 'line.3.horizontal.decrease.circle', md: 'tune' },
  noteAdd: { sf: 'doc.badge.plus', md: 'note_add' },
  createFolder: { sf: 'folder.badge.plus', md: 'create_new_folder' },
  paste: { sf: 'doc.on.clipboard', md: 'content_paste' },
  rename: { sf: 'pencil.line', md: 'drive_file_rename_outline' },
  move: { sf: 'folder.badge.gearshape', md: 'drive_file_move' },
  duplicate: { sf: 'plus.square.on.square', md: 'content_copy' },
  copy: { sf: 'doc.on.doc', md: 'content_copy' },
  delete: { sf: 'trash', md: 'delete' },
  open: { sf: 'eye', md: 'visibility' },
  edit: { sf: 'pencil', md: 'edit' },
  check: { sf: 'checkmark', md: 'check' },
  checkCircle: { sf: 'checkmark.circle.fill', md: 'check_circle' },
  circle: { sf: 'circle', md: 'radio_button_unchecked' },
  sync: { sf: 'arrow.triangle.2.circlepath', md: 'sync' },
  cloudDone: { sf: 'checkmark.icloud', md: 'cloud_done' },
  offline: { sf: 'arrow.down.circle', md: 'offline_pin' },
  swipe: { sf: 'hand.draw', md: 'swipe_left' },
  bold: { sf: 'bold', md: 'format_bold' },
  italic: { sf: 'italic', md: 'format_italic' },
  heading: { sf: 'textformat.size', md: 'format_h1' },
  list: { sf: 'list.bullet', md: 'format_list_bulleted' },
  quote: { sf: 'text.quote', md: 'format_quote' },
  link: { sf: 'link', md: 'link' },
  code: { sf: 'chevron.left.forwardslash.chevron.right', md: 'code' },
  undo: { sf: 'arrow.uturn.backward', md: 'undo' },
  redo: { sf: 'arrow.uturn.forward', md: 'redo' },
  keyboardHide: { sf: 'keyboard.chevron.compact.down', md: 'keyboard_hide' },
  agent: { sf: 'person.crop.circle.badge.plus', md: 'person_add' },
  restore: { sf: 'arrow.counterclockwise', md: 'restore' },
  logout: { sf: 'rectangle.portrait.and.arrow.right', md: 'logout' },
  apple: { sf: 'apple.logo', md: 'login' },
  // Project icons
  fitness: { sf: 'figure.strengthtraining.traditional', md: 'fitness_center' },
  web: { sf: 'globe', md: 'language' },
  server: { sf: 'server.rack', md: 'dns' },
  campaign: { sf: 'megaphone', md: 'campaign' },
  science: { sf: 'flask', md: 'science' },
  book: { sf: 'book.closed', md: 'menu_book' },
  design: { sf: 'paintpalette', md: 'palette' },
  rocket: { sf: 'paperplane', md: 'rocket_launch' },
} as const satisfies Record<string, { sf: SFSymbol; md: AndroidSymbol }>;

export type IconName = keyof typeof icons;

export const projectIcons: Record<ProjectIcon, IconName> = {
  folder: 'folder',
  fitness: 'fitness',
  web: 'web',
  server: 'server',
  campaign: 'campaign',
  science: 'science',
  book: 'book',
  code: 'code',
  design: 'design',
  rocket: 'rocket',
};

export function sf(name: IconName): SFSymbol {
  return icons[name].sf;
}

export function Icon({
  name,
  size = 20,
  color,
  weight,
  style,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}) {
  const glyph = icons[name];
  return (
    <SymbolView
      name={{ ios: glyph.sf, android: glyph.md, web: glyph.md }}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}
