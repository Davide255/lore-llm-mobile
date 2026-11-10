import { Platform, useWindowDimensions } from 'react-native';

import { isSplitLayout } from '@/lib/split';

export const SIDEBAR_WIDTH = 300;
/** Reading width of documents and lists next to the sidebar, as on the desktop app. */
export const CONTENT_MAX_WIDTH = 760;

/**
 * Tablet layout (iPad): a persistent sidebar with the project tree beside the
 * content, as in Lore LLM Desktop. Phones, and an iPad window narrowed by
 * Split View or Stage Manager, keep the tab bar. The web build is left as it
 * was: the desktop app is the big-screen client there.
 */
export function useSplitLayout(): boolean {
  const { width, height } = useWindowDimensions();
  return Platform.OS !== 'web' && isSplitLayout(width, height);
}
