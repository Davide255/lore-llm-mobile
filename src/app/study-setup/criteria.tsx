import { router, Stack, useNavigation } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { showActionSheet } from '@/components/action-sheet';
import { Icon } from '@/components/icon';
import { BigButton, FooterBar } from '@/components/study/parts';
import { choiceCardStyle, ProfileAvatar, StepProgress } from '@/components/study/profile-parts';
import { EmptyState, Screen } from '@/components/ui';
import { deleteProfile, saveProfile, startSession, studyDraft, studyProfiles } from '@/data/study';
import { haptic } from '@/lib/haptics';
import { routes } from '@/lib/routes';
import { applyProfile, MAX_PROFILES, newProfileId, profileSubtitle, stepError, type StudyProfile } from '@/lib/study-model';
import { useTheme } from '@/theme';

/**
 * A4 — Step 3 of 3: who grades. A profile carries the instructions, the
 * weighted criteria, the scale and the correction mode; the chosen one shows
 * its weights. Profiles are edited or created in A5 (also from Settings).
 */
export default function ChooseProfileScreen() {
  const t = useTheme();
  const draft = studyDraft.useValue();
  const profiles = studyProfiles.useValue();
  const navigation = useNavigation();
  if (!draft) return <EmptyState icon="school" title="Nessuna sessione da preparare" />;

  const chosen = profiles.find((p) => p.id === draft.profileId) ?? profiles[0];
  const graded = chosen ? applyProfile(draft, chosen) : null;
  const error = !graded ? 'Crea un profilo per farti valutare' : stepError(graded, 'criteria');

  const start = () => {
    if (!graded || error) return;
    startSession(graded);
    // Close the setup modal as a whole (its steps are a nested stack), then open the session:
    // closing the session later lands on the tab, not back on step 1.
    navigation.getParent()?.goBack();
    router.push(routes.studySession('generating'));
  };

  const more = (p: StudyProfile) =>
    showActionSheet({
      title: p.name,
      options: [
        { label: 'Modifica', icon: 'edit', onPress: () => router.push(routes.studySetupProfile(p.id)) },
        ...(profiles.length < MAX_PROFILES
          ? [{ label: 'Duplica', icon: 'duplicate' as const, onPress: () => saveProfile({ ...p, id: newProfileId(profiles, p.name), name: `${p.name} (copia)` }) }]
          : []),
        ...(profiles.length > 1 ? [{ label: 'Elimina', icon: 'delete' as const, destructive: true, onPress: () => deleteProfile(p.id) }] : []),
      ],
    });

  return (
    <>
      <Stack.Screen options={{ headerTitle: () => <StepProgress step={3} /> }} />
      <Screen>
        <Animated.View entering={FadeInDown.duration(380)} style={{ paddingHorizontal: 4, paddingTop: 10 }}>
          <Text style={[styles.title, { color: t.text }]}>
            Chi ti <Text style={{ color: t.accentText }}>valuta oggi?</Text>
          </Text>
          <Text style={[styles.sub, { color: t.textSecondary }]}>Scegli un profilo. Criteri, pesi e voto sono già dentro.</Text>
        </Animated.View>

        <View style={{ gap: 8, marginTop: 18 }}>
          {profiles.map((p, i) => {
            const on = p.id === chosen?.id;
            return (
              <Animated.View key={p.id} entering={FadeInDown.delay(60 + i * 55).duration(360)} layout={LinearTransition.duration(220)}>
              <Pressable
                onPress={() => {
                  if (on) return;
                  haptic.select();
                  studyDraft.set({ ...draft, profileId: p.id });
                }}
                onLongPress={() => {
                  haptic.tap();
                  more(p);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityHint="Tieni premuto per modificare, duplicare o eliminare"
                style={({ pressed }) => [[styles.card, choiceCardStyle(t, on)], pressed && { opacity: 0.85 }]}>
                <View style={styles.row}>
                  <ProfileAvatar icon={p.icon} strong={on} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: t.text, fontSize: 16, fontWeight: on ? '700' : '600', letterSpacing: -0.2 }}>
                      {p.name}
                    </Text>
                    <Text numberOfLines={1} style={{ color: on ? t.textBody : t.textSecondary, fontSize: 12.5, marginTop: 2 }}>
                      {profileSubtitle(p)}
                    </Text>
                  </View>
                  {on ? (
                    <Animated.View entering={FadeIn.duration(200)}>
                      <Icon name="checkCircle" size={22} color={t.accentText} />
                    </Animated.View>
                  ) : null}
                </View>
                {on && p.criteria.length ? (
                  <View style={styles.weights}>
                    {p.criteria.map((c, j) => (
                      <Animated.View key={c.id} entering={FadeIn.delay(80 + j * 40).duration(220)} style={[styles.weight, { backgroundColor: t.fill }]}>
                        <Text style={{ color: t.textBody, fontSize: 11.5, fontWeight: '600' }}>
                          {c.name} {c.weight}
                        </Text>
                      </Animated.View>
                    ))}
                  </View>
                ) : null}
              </Pressable>
              </Animated.View>
            );
          })}
          {profiles.length < MAX_PROFILES ? (
            <Animated.View entering={FadeInDown.delay(60 + profiles.length * 55).duration(360)} layout={LinearTransition}>
            <Pressable
              onPress={() => {
                haptic.light();
                router.push(routes.studySetupProfile());
              }}
              accessibilityRole="button"
              style={({ pressed }) => [[styles.card, styles.row, styles.add, { borderColor: t.hairline }], pressed && { opacity: 0.85 }]}>
              <View style={[styles.addIcon, { backgroundColor: t.accentSoft }]}>
                <Icon name="add" size={20} color={t.accentText} />
              </View>
              <Text style={{ color: t.accentText, fontSize: 15.5, fontWeight: '600' }}>Nuovo profilo</Text>
            </Pressable>
            </Animated.View>
          ) : null}
        </View>

        {chosen ? (
          <Pressable onPress={() => router.push(routes.studySetupProfile(chosen.id))} style={{ alignSelf: 'center', padding: 10, marginTop: 6 }} accessibilityRole="button">
            <Text style={{ color: t.accentText, fontSize: 14, fontWeight: '600' }}>Modifica “{chosen.name}”</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={[styles.note, { color: t.errorText }]}>{error}</Text> : null}
      </Screen>
      <FooterBar>
        <BigButton label="Inizia la sessione" icon="play" disabled={!!error} onPress={start} style={{ flex: 1 }} />
      </FooterBar>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.9, lineHeight: 32 },
  sub: { fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  card: { padding: 12, borderRadius: 16, borderWidth: 1.5, borderCurve: 'continuous' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weights: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10, paddingLeft: 50 },
  weight: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999 },
  add: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  addIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12.5, lineHeight: 17, marginTop: 6, marginHorizontal: 6, textAlign: 'center' },
});
