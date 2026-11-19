import { Stack } from 'expo-router';

import { stackOptions } from '@/components/stack-options';
import { useTheme } from '@/theme';

/** The «Nuovo file» modal: the form, with the «Posizione» folder picker pushed inside it. */
export default function NewFileLayout() {
  const t = useTheme();
  return <Stack screenOptions={stackOptions(t)} />;
}
