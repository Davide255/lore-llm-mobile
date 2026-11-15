import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { QuestionType } from '@/api/study/types';
import { Icon, type IconName } from '@/components/icon';
import { TYPE_ICONS } from '@/components/study/parts';
import { MixBar, RollingNumber, SmallStepper, TYPE_COLORS } from '@/components/study/profile-parts';
import { EmptyState } from '@/components/ui';
import { studyDraft } from '@/data/study';
import { haptic } from '@/lib/haptics';
import { estimatedMinutes, MAX_PER_TYPE, stepError, totalQuestions, TYPE_LABELS, type StudyDraft } from '@/lib/study-model';
import { brand, useTheme } from '@/theme';

const HINTS: Record<QuestionType, string> = { mc: 'Veloci, per scaldarti', tf: 'Smascherano i dubbi', open: 'Dove si vede chi ha capito' };
/** iOS 26: the sheet itself is liquid glass (transparent content, see the layout). */
export const glassSheet = isLiquidGlassAvailable();

/**
 * A3.1 — «Le tue domande», a sheet over A3: how many questions per type; the
 * total and the bar follow while counting. Applied on ✓, dropped on ✕.
 */
export default function MixSheet() {
  const t = useTheme();
  const draft = studyDraft.useValue();
  const [mix, setMix] = useState<Pick<StudyDraft, 'counts' | 'enabled'> | null>(draft ? { counts: draft.counts, enabled: draft.enabled } : null);
  if (!draft || !mix) return <EmptyState icon="school" title="Nessuna sessione da preparare" />;

  const shown = { ...draft, ...mix };
  const total = totalQuestions(shown);
  const error = stepError(shown, 'types');
  const set = (type: QuestionType, n: number) => setMix({ counts: { ...mix.counts, [type]: n }, enabled: { ...mix.enabled, [type]: n > 0 } });
  const done = () => {
    haptic.success();
    studyDraft.set({ ...draft, ...mix });
    router.back();
  };
  // Over glass the rows are a light veil, not a solid card.
  const rowBg = glassSheet ? (t.scheme === 'dark' ? 'rgba(250,249,245,0.07)' : 'rgba(255,255,255,0.55)') : t.cell;

  return (
    <View style={[styles.sheet, { backgroundColor: glassSheet ? 'transparent' : t.sheet }]}>
      <View style={styles.bar}>
        <RoundButton
          icon="close"
          label="Annulla"
          onPress={() => {
            haptic.light();
            router.back();
          }}
        />
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 }}>Le tue domande</Text>
        <RoundButton icon="check" label="Fatto" prominent disabled={!!error} onPress={done} />
      </View>

      <View style={{ alignItems: 'center', marginTop: 14 }}>
        <RollingNumber value={total} style={{ color: t.text, fontSize: 40, fontWeight: '800', letterSpacing: -1.6 }} />
        <Text style={{ color: error ? t.errorText : t.textSecondary, fontSize: 14, marginTop: 2 }}>
          {error ?? `${total === 1 ? 'domanda' : 'domande'} · circa ${estimatedMinutes(shown)} minuti`}
        </Text>
      </View>
      <View style={{ marginTop: 16, marginHorizontal: 4 }}>
        <MixBar draft={shown} legend={false} />
      </View>

      <View style={{ gap: 8, marginTop: 18 }}>
        {(['mc', 'tf', 'open'] as QuestionType[]).map((type, i) => {
          const n = mix.enabled[type] ? mix.counts[type] : 0;
          const color = TYPE_COLORS[type];
          return (
            <Animated.View key={type} entering={FadeInDown.delay(80 + i * 50).duration(320)} style={[styles.row, { backgroundColor: rowBg, opacity: n ? 1 : 0.6 }]}>
              <View style={[styles.tile, { backgroundColor: `${color}2e` }]}>
                <Icon name={TYPE_ICONS[type]} size={18} color={color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2 }}>
                  {type === 'open' ? 'Aperte' : TYPE_LABELS[type]}
                </Text>
                <Text numberOfLines={1} style={{ color: t.textSecondary, fontSize: 12.5, marginTop: 1 }}>
                  {HINTS[type]}
                </Text>
              </View>
              <SmallStepper value={n} step={1} suffix="" max={MAX_PER_TYPE} onChange={(v) => set(type, v)} />
            </Animated.View>
          );
        })}
      </View>
      <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 10, textAlign: 'center' }}>Metti 0 per saltare un tipo.</Text>
    </View>
  );
}

/** A circular header button: native liquid glass on iOS 26, a soft fill elsewhere. */
function RoundButton({ icon, label, onPress, prominent, disabled }: { icon: IconName; label: string; onPress: () => void; prominent?: boolean; disabled?: boolean }) {
  const t = useTheme();
  const fg = prominent ? (disabled ? t.textMuted : '#fff') : t.text;
  const glyph = <Icon name={icon} size={17} color={fg} weight="semibold" />;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
      {glassSheet ? (
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          tintColor={prominent && !disabled ? brand.purple : undefined}
          colorScheme={t.scheme}
          style={styles.round}>
          {glyph}
        </GlassView>
      ) : (
        <View style={[styles.round, { backgroundColor: prominent && !disabled ? brand.purple : t.fill }]}>{glyph}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 18, borderCurve: 'continuous' },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
});
