import { Stack } from 'expo-router';

import { stackOptions } from '@/components/stack-options';
import { useTheme } from '@/theme';

/**
 * A study session, full screen over the tabs: preparation (B1), the questions
 * (B2–B4), the summary (B5), the grade (C1) and an answer's detail (C2).
 * No swipe-back: leaving a session goes through the close button, which asks.
 */
export default function StudySessionLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ ...stackOptions(t), gestureEnabled: false }} />;
}
