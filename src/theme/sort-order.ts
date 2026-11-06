import AsyncStorage from '@react-native-async-storage/async-storage';

import { createSignal } from '@/data/store';
import { DEFAULT_SORT, isSortOrder, type SortOrder } from '@/lib/sort';

/** Per-device order of folder contents. */
const STORAGE_KEY = 'ui.sortOrder';
const order = createSignal<SortOrder>(DEFAULT_SORT);

export async function loadSortOrder() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isSortOrder(stored)) order.set(stored);
  } catch {
    // Keep the default order.
  }
}

export function setSortOrder(next: SortOrder) {
  order.set(next);
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
}

export const useSortOrder = order.useValue;
