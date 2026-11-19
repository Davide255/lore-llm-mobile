import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signIn, type AuthProvider } from '@/auth/session';
import { Icon } from '@/components/icon';
import { fonts, useTheme } from '@/theme';


/** The first thing on screen: nothing else is reachable until the user signs in. */
export default function SignInScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  // Sign in with Apple follows Apple's button style: black on light, white on dark.
  const appleInk = t.scheme === 'dark' ? '#000' : '#fff';

  const start = async (provider: AuthProvider) => {
    setBusy(provider);
    try {
      // Null when the user closed the sheet: just stay here.
      await signIn(provider);
    } catch (e) {
      Alert.alert('Accesso non riuscito', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Image source={require('../../assets/images/lore-1c-glyph-combined.png')} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.title, { color: t.text }]}>Lore LLM</Text>
        {/* The motto of the app: notes outlive what is said, and agents read what is written. */}
        <Text style={[styles.motto, { color: t.textSecondary }]}>Verba volant, scripta manent.</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>Le tue note, la memoria dei tuoi agenti.</Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          onPress={() => start('SignInWithApple')}
          disabled={busy != null}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: t.scheme === 'dark' ? '#fff' : '#000', opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
          ]}>
          {busy === 'SignInWithApple' ? (
            <ActivityIndicator color={appleInk} />
          ) : (
            <View style={styles.buttonRow}>
              <Icon name="apple" size={19} color={appleInk} weight="medium" />
              <Text style={[styles.buttonLabel, { color: appleInk }]}>Accedi con Apple</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => start('Google')}
          disabled={busy != null}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: t.accent, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
          {busy === 'Google' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>Accedi con Google</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  logo: { width: 96, height: 96, marginBottom: 6 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  motto: { fontSize: 19, lineHeight: 26, fontStyle: 'italic', fontFamily: fonts.serif, textAlign: 'center', maxWidth: 340, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 340, marginTop: -6 },
  buttons: { gap: 12 },
  button: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
