import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { Stack } from 'expo-router';

import { TextSizeSlider } from '@/components/text-size-slider';
import { Screen, SectionHeader } from '@/components/ui';
import { useTheme } from '@/theme';
import { appearanceOptions, setAppearance, useAppearance } from '@/theme/appearance';

/** Settings → Appearance: theme and reading size, both per device. */
export default function AppearanceSettingsScreen() {
  const t = useTheme();
  const appearance = useAppearance();
  return (
    <>
      <Stack.Screen options={{ title: 'Aspetto', headerLargeTitle: false }} />
      <Screen contentContainerStyle={{ paddingTop: 8 }}>
        <SectionHeader>Tema</SectionHeader>
        <SegmentedControl
          values={appearanceOptions.map((o) => o.label)}
          selectedIndex={appearanceOptions.findIndex((o) => o.value === appearance)}
          onValueChange={(label) => setAppearance(appearanceOptions.find((o) => o.label === label)!.value)}
          appearance={t.scheme}
          tintColor={t.accent}
        />
        <SectionHeader>Dimensione del testo</SectionHeader>
        <TextSizeSlider />
      </Screen>
    </>
  );
}
