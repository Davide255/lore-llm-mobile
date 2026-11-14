import { Stack } from 'expo-router';

import { stackOptions } from '@/components/stack-options';
import { useTheme } from '@/theme';

export default function TabStackLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ ...stackOptions(t), headerLargeTitle: true }} />;
}
