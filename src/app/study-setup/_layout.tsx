import { Stack } from 'expo-router';

import { stackOptions } from '@/components/stack-options';
import { useTheme } from '@/theme';

/** The «Nuova sessione» modal: three steps pushed inside it (A2 → A3 → A4). */
export default function StudySetupLayout() {
  const t = useTheme();
  return <Stack screenOptions={stackOptions(t)} />;
}
