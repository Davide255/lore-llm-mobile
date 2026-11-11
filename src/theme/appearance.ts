import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

import { createSignal } from '@/data/store';

/** Per-device UI preference (not part of the knowledge base settings). */
export type AppearancePreference = 'system' | 'light' | 'dark';

/** The choices offered in Settings → Aspetto, in order. */
export const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
];

const STORAGE_KEY = 'ui.appearance';
const preference = createSignal<AppearancePreference>('system');

function apply(pref: AppearancePreference) {
  try {
    // Overrides the native trait collection too, so glass, alerts, menus and
    // the keyboard follow the in-app choice.
    Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
  } catch {
    // Not supported on every platform (e.g. web); useTheme still honours `pref`.
  }
}

export async function loadAppearance() {
  try {
    const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as AppearancePreference | null;
    if (stored === 'light' || stored === 'dark') {
      preference.set(stored);
      apply(stored);
    }
  } catch {
    // Fall back to the system appearance.
  }
}

export function setAppearance(pref: AppearancePreference) {
  preference.set(pref);
  apply(pref);
  AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
}

export const useAppearance = preference.useValue;
