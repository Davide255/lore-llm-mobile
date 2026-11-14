import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Stack } from 'expo-router';

import { stackOptions } from '@/components/stack-options';
import { useTheme } from '@/theme';

/**
 * The «Nuova sessione» modal: three steps pushed inside it (A2 → A3 → A4),
 * the mix sheet over A3 (A3.1) and the profile editor pushed from A4 (A5).
 */
export default function StudySetupLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={stackOptions(t)}>
      <Stack.Screen
        name="mix"
        options={{
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          ...(isLiquidGlassAvailable() ? {} : { sheetCornerRadius: 24 }),
          // iOS 26: a transparent sheet shows the system's liquid glass.
          contentStyle: { backgroundColor: isLiquidGlassAvailable() ? 'transparent' : t.sheet },
        }}
      />
    </Stack>
  );
}
