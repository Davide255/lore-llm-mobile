import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { Difficulty } from '@/api/study/types';
import { Icon, type IconName } from '@/components/icon';
import { BigButton, FooterBar } from '@/components/study/parts';
import { choiceCardStyle, MixBar, RollingNumber, SmallStepper, StepProgress } from '@/components/study/profile-parts';
import { EmptyState, Screen } from '@/components/ui';
import { useProjects } from '@/data/hooks';
import { studyDraft } from '@/data/study';
import { haptic } from '@/lib/haptics';
import { routes } from '@/lib/routes';
import { estimatedMinutes, MAX_TIME_LIMIT, MIN_TIME_LIMIT, stepError, timeLimitMinutes, totalQuestions } from '@/lib/study-model';
import { brand, useTheme } from '@/theme';

const INTENSITIES: { value: Difficulty; title: string; hint: string; icon: IconName; tint: string; gradient?: string; disabled?: boolean }[] = [
  { value: 'ripasso', title: 'Ripasso', hint: 'Riscaldamento. Zero ansia.', icon: 'calm', tint: '#5cc87c' },
  { value: 'esame', title: 'Esame', hint: 'Come il giorno vero. Nessuno sconto.', icon: 'flame', tint: '#ff8a3d', gradient: 'linear-gradient(160deg, #ffb547 0%, #ff6a3d 100%)' },
  // Not available yet: shown, but it can't be chosen.
  { value: 'orale', title: 'Orale', hint: 'Il prof ti guarda. Spiega tutto.', icon: 'voice', tint: '#ff6b6b', disabled: true },
];

/**
 * A3 — Step 2 of 3: one question, «quanto vuoi spingere». Three intensities
 * (the difficulty), the mix of questions as a bar (changed in the A3.1 sheet)
 * and the time limit. Correction mode and grading live in the profile (A4);
 * the source is always cited.
 */
export default function QuestionTypesScreen() {
  const t = useTheme();
  const draft = studyDraft.useValue();
  const projects = useProjects();
  if (!draft) return <EmptyState icon="school" title="Nessuna sessione da preparare" />;

  const error = stepError(draft, 'types');
  const total = totalQuestions(draft);
  const projectTitle = projects.data?.find((p) => p.name === draft.project)?.title;
  const limit = timeLimitMinutes(draft);

  return (
    <>
      <Stack.Screen options={{ headerTitle: () => <StepProgress step={2} /> }} />
      <Screen>
        <Animated.View entering={FadeInDown.duration(380)} style={{ paddingHorizontal: 4, paddingTop: 10 }}>
          <Text style={[styles.title, { color: t.text }]}>
            Quanto vuoi{'\n'}
            <Text style={{ color: t.accentText }}>spingere oggi?</Text>
          </Text>
          <Text style={[styles.sub, { color: t.textSecondary }]}>{projectTitle ? `Si studia ${projectTitle}. ` : ''}Il ritmo lo scegli tu.</Text>
        </Animated.View>

        <View style={{ gap: 8, marginTop: 18 }}>
          {INTENSITIES.map((it, i) => {
            const on = !it.disabled && draft.difficulty === it.value;
            return (
              <Animated.View key={it.value} entering={FadeInDown.delay(60 + i * 60).duration(360)}>
              <Pressable
                onPress={() => {
                  if (on) return;
                  haptic.select();
                  studyDraft.set({ ...draft, difficulty: it.value });
                }}
                disabled={it.disabled}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: it.disabled }}
                style={({ pressed }) => [[styles.card, choiceCardStyle(t, on), { opacity: it.disabled ? 0.45 : 1 }], pressed && { opacity: 0.85 }]}>
                <View
                  style={[
                    styles.tile,
                    { backgroundColor: on && it.gradient ? it.tint : `${it.tint}26`, experimental_backgroundImage: on ? it.gradient : undefined },
                  ]}>
                  <Icon name={it.icon} size={20} color={on && it.gradient ? '#fff' : it.tint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: on ? '700' : '600', letterSpacing: -0.2 }}>{it.title}</Text>
                  <Text style={{ color: on ? t.textBody : t.textSecondary, fontSize: 12.5, marginTop: 2 }}>{it.hint}</Text>
                </View>
                {on ? (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <Icon name="checkCircle" size={22} color={t.accentText} />
                  </Animated.View>
                ) : null}
                {it.disabled ? (
                  <View style={[styles.soon, { backgroundColor: t.fill }]}>
                    <Text style={{ color: t.textSecondary, fontSize: 11, fontWeight: '600' }}>Presto</Text>
                  </View>
                ) : null}
              </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <Animated.View entering={FadeInDown.delay(260).duration(360)} style={[styles.box, { backgroundColor: t.cell, marginTop: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
              <RollingNumber value={total} style={{ color: t.text, fontSize: 17, fontWeight: '700' }} />
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 }}>{total === 1 ? 'domanda' : 'domande'}</Text>
              <Text style={{ color: t.textSecondary, fontSize: 13, fontWeight: '500' }}>· ~{estimatedMinutes(draft)} min</Text>
            </View>
            <Pressable
              onPress={() => {
                haptic.light();
                router.push(routes.studySetup('mix'));
              }}
              hitSlop={10}
              accessibilityRole="button">
              <Text style={{ color: t.accentText, fontSize: 14, fontWeight: '600' }}>Modifica</Text>
            </Pressable>
          </View>
          <MixBar draft={draft} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(320).duration(360)} layout={LinearTransition} style={[styles.box, styles.timer, { backgroundColor: t.cell }]}>
          <Icon name="timer" size={20} color="#ff8a3d" />
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '500' }}>Limite di tempo</Text>
          {draft.timeLimit ? (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <SmallStepper value={limit} step={5} min={MIN_TIME_LIMIT} max={MAX_TIME_LIMIT} suffix=" min" onChange={(n) => studyDraft.set({ ...draft, timeLimitMin: n })} />
            </Animated.View>
          ) : null}
          <Switch
            value={draft.timeLimit}
            onValueChange={(on) => {
              haptic.select();
              studyDraft.set({ ...draft, timeLimit: on, ...(on ? { timeLimitMin: limit } : {}) });
            }}
            trackColor={{ true: brand.purple, false: undefined }}
            thumbColor="#fff"
            ios_backgroundColor={t.fill}
            accessibilityLabel="Limite di tempo"
          />
        </Animated.View>
        <Text style={[styles.note, { color: error ? t.errorText : t.textMuted }]}>
          {error ?? (draft.timeLimit ? 'Scaduto il tempo si va al riepilogo; una sessione a tempo non si mette in pausa.' : 'Tempo libero: puoi mettere in pausa e riprendere.')}
        </Text>
      </Screen>
      <FooterBar>
        <BigButton label="Ci sto" trailingIcon="arrowForward" disabled={!!error} onPress={() => router.push(routes.studySetup('criteria'))} style={{ flex: 1 }} />
      </FooterBar>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.9, lineHeight: 32 },
  sub: { fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderCurve: 'continuous' },
  tile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
  box: { borderRadius: 16, padding: 14, borderCurve: 'continuous' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingVertical: 10 },
  soon: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9999 },
  note: { fontSize: 12, lineHeight: 16, marginTop: 8, marginHorizontal: 6 },
});
