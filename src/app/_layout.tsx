import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setKnowledgeBaseUser } from '@/api';
import { authUser, loadSession } from '@/auth/session';
import { ActionSheetHost } from '@/components/action-sheet';
import { stackOptions } from '@/components/stack-options';
import { ToastHost } from '@/components/toast';
import { resetQueries } from '@/data/store';
import { brand, useTheme } from '@/theme';
import { loadAppearance } from '@/theme/appearance';

SplashScreen.preventAutoHideAsync().catch(() => {});
loadAppearance();
loadSession();

export default function RootLayout() {
  const t = useTheme();
  const user = authUser.useValue();
  // The user whose space the knowledge-base client has loaded (undefined: not yet known).
  const [space, setSpace] = useState<string | null | undefined>(undefined);
  const userId = user === undefined ? undefined : (user?.id ?? null);

  useEffect(() => {
    if (userId === undefined) return;
    let current = true;
    resetQueries();
    setKnowledgeBaseUser(userId).then(() => current && setSpace(userId));
    return () => {
      current = false;
    };
  }, [userId]);

  const ready = space !== undefined && space === userId;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  const signedIn = space !== null;

  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: brand.purple,
      background: t.background,
      card: t.background,
      text: t.text,
      border: t.hairline,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.background }}>
      {/* Explicit provider: the toast and sheet hosts live outside the navigator. */}
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'} />
          <Stack screenOptions={stackOptions(t)}>
            {/* Login is required before anything else is shown. */}
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="sign-in" options={{ headerShown: false, animation: 'fade' }} />
            </Stack.Protected>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
              <Stack.Screen name="folder/[...path]" options={{ headerLargeTitle: true, title: '' }} />
              <Stack.Screen name="file/[...path]" options={{ title: '' }} />
              <Stack.Screen name="change/[id]" options={{ title: '' }} />
              <Stack.Screen name="agent/[id]" options={{ title: '' }} />
              <Stack.Screen name="edit/[...path]" options={{ presentation: 'modal', title: '' }} />
              <Stack.Screen name="new-file" options={{ presentation: 'modal', title: 'Nuovo file' }} />
              <Stack.Screen name="new-project" options={{ presentation: 'modal', title: 'Nuovo progetto' }} />
              <Stack.Screen name="rename" options={{ presentation: 'modal', title: 'Rinomina' }} />
              <Stack.Screen name="move" options={{ presentation: 'modal', title: 'Sposta in…' }} />
              <Stack.Screen name="connect-agent" options={{ presentation: 'modal', title: 'Collega un agente' }} />
            </Stack.Protected>
          </Stack>
          <ActionSheetHost />
          <ToastHost />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
