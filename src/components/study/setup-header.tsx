import { Stack } from 'expo-router';

import { HeaderTitle } from '@/components/ui';

/** «Nuova sessione · Passo n di 3» */
export function SetupTitle({ step }: { step: number }) {
  return <Stack.Screen options={{ headerTitle: () => <HeaderTitle title="Nuova sessione" subtitle={`Passo ${step} di 3`} mono={false} /> }} />;
}
