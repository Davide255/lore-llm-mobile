import { Stack } from 'expo-router';

import { HeaderTitle } from '@/components/ui';

/** «Nuova sessione · Passo n di 3»; `title` replaces «Nuova sessione» (e.g. a folder's name). */
export function SetupTitle({ step, title = 'Nuova sessione' }: { step: number; title?: string }) {
  return <Stack.Screen options={{ headerTitle: () => <HeaderTitle title={title} subtitle={`Passo ${step} di 3`} mono={false} /> }} />;
}
