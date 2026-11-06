import AsyncStorage from '@react-native-async-storage/async-storage';

import { createSignal } from '@/data/store';

/** Per-device reading size for notes, as a multiplier of the default (1). */
export const TEXT_SCALE_MIN = 0.8;
export const TEXT_SCALE_MAX = 1.6;
export const TEXT_SCALE_STEP = 0.05;

/** Sizes offered by the note menu. */
export const TEXT_SIZE_PRESETS = [0.85, 1, 1.15, 1.3, 1.5, 1.6];

const STORAGE_KEY = 'ui.textScale';
const scale = createSignal(1);

export const clampTextScale = (n: number) =>
  Number.isFinite(n) ? Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Math.round(n / TEXT_SCALE_STEP) * TEXT_SCALE_STEP)) : 1;

export async function loadTextScale() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored !== null) scale.set(clampTextScale(Number(stored)));
  } catch {
    // Keep the default size.
  }
}

export function setTextScale(next: number) {
  const value = clampTextScale(next);
  scale.set(value);
  AsyncStorage.setItem(STORAGE_KEY, String(value)).catch(() => {});
}

export const useTextScale = scale.useValue;
