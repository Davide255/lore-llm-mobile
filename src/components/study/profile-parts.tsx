import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, LinearTransition } from 'react-native-reanimated';

import type { QuestionType } from '@/api/study/types';
import { Icon, type IconName } from '@/components/icon';
import { effectiveMix, type ProfileIcon, type StudyDraft } from '@/lib/study-model';
import { haptic } from '@/lib/haptics';
import { brand, useTheme, type Theme } from '@/theme';

/** Pieces of the new setup steps and the profiles (design «Modalità studio» A3–A5). */

export const PROFILE_GLYPHS: Record<ProfileIcon, { icon: IconName; label: string; tint: string; gradient?: string }> = {
  gavel: { icon: 'gavel', label: 'Martelletto', tint: '#8f5cff', gradient: 'linear-gradient(160deg, #8f5cff 0%, #3a86ff 100%)' },
  heart: { icon: 'heart', label: 'Cuore', tint: '#5cc87c' },
  document: { icon: 'examDoc', label: 'Compito', tint: '#f5a623' },
  school: { icon: 'schoolFill', label: 'Tocco', tint: '#3a86ff' },
  bulb: { icon: 'bulb', label: 'Lampadina', tint: '#f5c623' },
  science: { icon: 'science', label: 'Laboratorio', tint: '#5ac8fa' },
  book: { icon: 'book', label: 'Libro', tint: '#ff8a3d' },
  voice: { icon: 'voice', label: 'Voce', tint: '#ff6b6b' },
};

/** Round badge of a profile: filled gradient when `strong`, a soft tint otherwise. */
export function ProfileAvatar({ icon, size = 38, strong }: { icon: ProfileIcon; size?: number; strong?: boolean }) {
  const g = PROFILE_GLYPHS[icon] ?? PROFILE_GLYPHS.school;
  const solid = strong;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: solid ? g.tint : `${g.tint}29`,
        experimental_backgroundImage: solid ? (g.gradient ?? `linear-gradient(160deg, ${g.tint} 0%, ${g.tint}b3 100%)`) : undefined,
      }}>
      <Icon name={g.icon} size={size * 0.52} color={solid ? '#fff' : g.tint} />
    </View>
  );
}

/** The type colours of the mix bar: purple, blue, orange as in the design. */
export const TYPE_COLORS: Record<QuestionType, string> = { mc: '#8f5cff', tf: '#3a86ff', open: '#f5a623' };
const SHORT: Record<QuestionType, [string, string]> = { mc: ['multipla', 'multipla'], tf: ['vero/falso', 'vero/falso'], open: ['aperta', 'aperte'] };

/** A3 / A3.1 — one segmented bar for the mix of question types, legend under it. */
export function MixBar({ draft, legend = true }: { draft: Pick<StudyDraft, 'counts' | 'enabled'>; legend?: boolean }) {
  const t = useTheme();
  const mix = effectiveMix(draft);
  const types = (['mc', 'tf', 'open'] as QuestionType[]).filter((k) => mix[k] > 0);
  return (
    <View>
      <View style={styles.bar} accessibilityRole="image" accessibilityLabel={types.map((k) => `${mix[k]} ${SHORT[k][mix[k] === 1 ? 0 : 1]}`).join(', ')}>
        {types.length ? (
          types.map((k, i) => (
            <Animated.View
              key={k}
              entering={FadeIn.duration(200)}
              layout={LinearTransition.duration(220)}
              style={{
                flex: mix[k],
                backgroundColor: TYPE_COLORS[k],
                borderTopLeftRadius: i === 0 ? 9999 : 2,
                borderBottomLeftRadius: i === 0 ? 9999 : 2,
                borderTopRightRadius: i === types.length - 1 ? 9999 : 2,
                borderBottomRightRadius: i === types.length - 1 ? 9999 : 2,
              }}
            />
          ))
        ) : (
          <View style={{ flex: 1, borderRadius: 9999, backgroundColor: t.track }} />
        )}
      </View>
      {legend && types.length ? (
        <View style={styles.legend}>
          {types.map((k) => (
            <Animated.View key={k} entering={FadeIn.duration(200)} layout={LinearTransition} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: TYPE_COLORS[k] }} />
              <RollingNumber value={mix[k]} style={{ color: t.textSecondary, fontSize: 12 }} />
              <Text style={{ color: t.textSecondary, fontSize: 12 }}>{SHORT[k][mix[k] === 1 ? 0 : 1]}</Text>
            </Animated.View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A number that rolls in from below when it grows and from above when it shrinks. */
export function RollingNumber({ value, suffix = '', style }: { value: number; suffix?: string; style?: TextStyle }) {
  // The previous value, to know which way to roll (updated while rendering, the React way).
  const [last, setLast] = useState({ value, up: true });
  if (last.value !== value) setLast({ value, up: value > last.value });
  const up = last.value !== value ? value > last.value : last.up;
  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.Text key={value} entering={(up ? FadeInUp : FadeInDown).duration(180)} style={[{ fontVariant: ['tabular-nums'] }, style]}>
        {value}
        {suffix}
      </Animated.Text>
    </View>
  );
}

/** «− 40% +»: compact stepper with a tick on every change and a bump at its limits (A3, A3.1, A5). */
export function SmallStepper({ value, onChange, step = 5, suffix = '%', min = 0, max = 100 }: { value: number; onChange: (n: number) => void; step?: number; suffix?: string; min?: number; max?: number }) {
  const t = useTheme();
  const btn = (glyph: string, next: number, label: string) => {
    const off = next < min || next > max;
    return (
      <Pressable
        onPress={() => {
          // At a limit the button stays tappable and answers with a bump instead of a tick.
          if (off) return haptic.warn();
          haptic.select();
          onChange(next);
        }}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off }}
        style={({ pressed }) => [styles.stepBtn, { opacity: off ? 0.3 : pressed ? 0.5 : 1 }]}>
        <Text style={{ color: t.textSecondary, fontSize: 18, fontWeight: '500' }}>{glyph}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.stepper, { backgroundColor: t.fill }]}>
      {btn('−', value - step, 'Meno')}
      <View style={{ minWidth: 38, alignItems: 'center' }}>
        <RollingNumber value={value} suffix={suffix} style={{ color: t.text, fontSize: 14, fontWeight: '600' }} />
      </View>
      {btn('+', value + step, 'Più')}
    </View>
  );
}

/** A choice card: the selected one has the purple border and glow of A3/A4. */
export function choiceCardStyle(t: Theme, selected: boolean) {
  return selected
    ? {
        backgroundColor: t.scheme === 'dark' ? '#1f1b2e' : t.cellRaised,
        experimental_backgroundImage:
          t.scheme === 'dark' ? 'linear-gradient(225deg, rgba(143,92,255,0.40) 0%, rgba(143,92,255,0) 60%)' : undefined,
        borderColor: brand.purple,
        boxShadow: t.scheme === 'dark' ? '0 10px 26px rgba(91,60,200,0.25)' : '0 6px 18px rgba(91,60,200,0.15)',
      }
    : { backgroundColor: t.cell, borderColor: 'transparent' };
}

/** Header title of setup steps 2 and 3: three segments and «2/3» (A3, A4). */
export function StepProgress({ step }: { step: number }) {
  const t = useTheme();
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`Passo ${step} di 3`}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i <= step ? brand.purple : t.track,
            experimental_backgroundImage: i === step ? brand.gradient : undefined,
          }}
        />
      ))}
      <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], marginLeft: 6 }}>{step}/3</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 3, height: 8 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 9 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 9999, paddingHorizontal: 2 },
  stepBtn: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 190 },
});
