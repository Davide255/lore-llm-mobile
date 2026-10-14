import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL } from '@/api/cloud/cloud-client';
import { signIn } from '@/auth/session';
import { fonts, useTheme } from '@/theme';

const host = API_URL.replace(/^https?:\/\//, '');

/** The first thing on screen: nothing else is reachable until the user signs in. */
export default function SignInScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      // Null when the user closed the sheet: just stay here.
      await signIn();
    } catch (e) {
      Alert.alert('Accesso non riuscito', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Image source={require('../../assets/images/lore-1c-glyph-combined.png')} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.title, { color: t.text }]}>Lore LLM</Text>
        <Text style={[styles.body, { color: t.textSecondary }]}>
          La knowledge base che condividi con i tuoi agenti. Ogni progetto ha il suo{' '}
          <Text style={{ fontFamily: fonts.mono }}>index.md</Text> generato e la sua{' '}
          <Text style={{ fontFamily: fonts.mono }}>checklist.md</Text>. Accedi per aprirla.
        </Text>
      </View>

      <Pressable
        onPress={start}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { backgroundColor: t.accent, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>Accedi con Google</Text>}
      </Pressable>
      <Text style={[styles.server, { color: t.textMuted }]}>Server: {host}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  logo: { width: 96, height: 96, marginBottom: 6 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  button: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
  buttonLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
  server: { fontSize: 12, textAlign: 'center', marginTop: 12 },
});
