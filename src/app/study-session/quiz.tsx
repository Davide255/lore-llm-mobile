import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Answer, Question } from '@/api/study/types';
import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { BigButton, FooterBar, SessionProgress, SourceLine, TypeChip } from '@/components/study/parts';
import { EmptyState, HeaderTitle } from '@/components/ui';
import { abortSession, goTo, setAnswer, studySession, toggleFlag } from '@/data/study';
import { useCloseSession } from '@/components/study/use-close-session';
import { routes } from '@/lib/routes';
import { closedOutcome, estimatedMinutes, wordCount } from '@/lib/study-model';
import { useTheme } from '@/theme';

const LETTERS = ['A', 'B', 'C', 'D'];
/** B4's accessory bar: what a maths answer needs and a phone keyboard hides. */
const SYMBOLS = ['∑', '²', 'ⁿ', 'ₙ', '√', '∞', '→', '≤', '≥', '≠', '∫', 'π', 'ε', 'δ', '±', '·'];

/**
 * B2–B4 — One question per screen, progress on top, back and forward, «Segna per
 * rivedere». No right/wrong colours unless the user turned «Correzione alla
 * fine» off, and then only for closed questions.
 */
export default function QuizScreen() {
  const t = useTheme();
  const s = studySession.useValue();
  const exit = useCloseSession();
  const remaining = useCountdown(s?.draft.timeLimit && s.startedAt ? s.startedAt + estimatedMinutes(s.draft) * 60_000 : null);

  useEffect(() => {
    if (remaining === 0) {
      router.replace(routes.studySession('summary'));
      Alert.alert('Tempo scaduto', 'Controlla il riepilogo e consegna.');
    }
  }, [remaining]);

  if (!s || !s.questions.length) return <EmptyState icon="school" title="Nessuna sessione in corso" />;
  const q = s.questions[s.current]!;
  const answer = s.answers[q.id];
  const last = s.current === s.questions.length - 1;
  const flagged = s.flagged.includes(q.id);

  const close = () =>
    Alert.alert('Interrompere la sessione?', 'Le risposte date finora andranno perse: nessun report viene salvato.', [
      { text: 'Continua', style: 'cancel' },
      {
        text: 'Interrompi',
        style: 'destructive',
        onPress: () => {
          abortSession();
          exit();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle
              title={`${s.current + 1}/${s.questions.length}`}
              subtitle={remaining !== null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} rimasti` : undefined}
              mono={false}
            />
          ),
        }}
      />
      <HeaderItems
        left={[{ kind: 'button', label: 'Interrompi', icon: 'close', onPress: close }]}
        right={[{ kind: 'button', label: 'Riepilogo', icon: 'grid', onPress: () => router.push(routes.studySession('summary')) }]}
      />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 32 }}>
          <SessionProgress index={s.current + 1} total={s.questions.length} />
          <View style={{ height: 18 }} />
          <TypeChip type={q.type} />
          <Text style={[styles.prompt, { color: t.text }]}>{q.prompt}</Text>
          {q.source ? <SourceLine path={q.source.path} locator={q.source.locator} /> : null}
          <View style={{ height: 22 }} />
          {q.type === 'mc' ? (
            <MultipleChoice q={q} answer={answer} reveal={!s.draft.correctionAtEnd} />
          ) : q.type === 'tf' ? (
            <TrueFalse q={q} answer={answer} reveal={!s.draft.correctionAtEnd} />
          ) : (
            <OpenAnswer key={q.id} q={q} answer={answer} />
          )}
          <Pressable onPress={() => toggleFlag(q.id)} style={styles.flag} accessibilityRole="button" accessibilityState={{ selected: flagged }}>
            <Icon name={flagged ? 'flagFill' : 'flag'} size={16} color={flagged ? t.warning : t.textSecondary} />
            <Text style={{ color: flagged ? t.warning : t.textSecondary, fontSize: 14.5 }}>{flagged ? 'Da rivedere' : 'Segna per rivedere'}</Text>
          </Pressable>
        </ScrollView>
        <FooterBar>
          <BigButton label="Indietro" variant="tinted" onPress={() => goTo(s.current - 1)} disabled={s.current === 0} style={{ flex: 1 }} />
          <BigButton
            label={last ? 'Riepilogo' : 'Avanti'}
            onPress={() => (last ? router.push(routes.studySession('summary')) : goTo(s.current + 1))}
            style={{ flex: 1 }}
          />
        </FooterBar>
      </KeyboardAvoidingView>
    </>
  );
}

/** Seconds left until `deadline` (ms), ticking; null without a deadline. */
function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null;
}

function Choice({ label, letter, selected, state, onPress }: { label: string; letter?: string; selected: boolean; state: 'right' | 'wrong' | null; onPress: () => void }) {
  const t = useTheme();
  const border = state === 'right' ? t.success : state === 'wrong' ? t.error : selected ? t.accent : 'transparent';
  const bg = state === 'right' ? t.successSoft : state === 'wrong' ? t.errorSoft : selected ? t.accentSoft : t.cell;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.choice, { backgroundColor: bg, borderColor: border, opacity: pressed ? 0.85 : 1 }]}>
      {letter ? (
        <View style={[styles.letter, { backgroundColor: selected ? t.accent : t.fill }]}>
          <Text style={{ color: selected ? '#fff' : t.textSecondary, fontWeight: '700', fontSize: 13 }}>{letter}</Text>
        </View>
      ) : null}
      <Text style={{ flex: 1, color: t.text, fontSize: 16.5, lineHeight: 22 }}>{label}</Text>
      {state === 'right' ? <Icon name="checkCircle" size={20} color={t.success} /> : null}
    </Pressable>
  );
}

function MultipleChoice({ q, answer, reveal }: { q: Extract<Question, { type: 'mc' }>; answer?: Answer; reveal: boolean }) {
  const outcome = reveal ? closedOutcome(q, answer) : null;
  return (
    <View style={{ gap: 10 }}>
      {q.options.map((o, i) => {
        const selected = answer?.choice === i;
        const state = outcome === null ? null : i === q.correctIndex ? 'right' : selected ? 'wrong' : null;
        return <Choice key={i} letter={LETTERS[i]} label={o} selected={selected} state={state} onPress={() => setAnswer(q.id, { choice: i })} />;
      })}
      {outcome !== null ? <Explanation text={q.explanation} /> : null}
    </View>
  );
}

function TrueFalse({ q, answer, reveal }: { q: Extract<Question, { type: 'tf' }>; answer?: Answer; reveal: boolean }) {
  const t = useTheme();
  const outcome = reveal ? closedOutcome(q, answer) : null;
  const state = (v: boolean) => (outcome === null ? null : v === q.correct ? 'right' : answer?.value === v ? 'wrong' : null);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[true, false].map((v) => (
          <Pressable
            key={String(v)}
            onPress={() => setAnswer(q.id, { value: v })}
            accessibilityRole="radio"
            accessibilityState={{ selected: answer?.value === v }}
            style={[
              styles.tf,
              {
                backgroundColor: state(v) === 'right' ? t.successSoft : state(v) === 'wrong' ? t.errorSoft : answer?.value === v ? t.accentSoft : t.cell,
                borderColor: state(v) === 'right' ? t.success : state(v) === 'wrong' ? t.error : answer?.value === v ? t.accent : 'transparent',
              },
            ]}>
            <Icon name={v ? 'check' : 'close'} size={24} color={answer?.value === v ? t.accentText : t.textSecondary} weight="semibold" />
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>{v ? 'Vero' : 'Falso'}</Text>
          </Pressable>
        ))}
      </View>
      {outcome !== null ? <Explanation text={q.explanation} /> : null}
      <Text style={[styles.label, { color: t.textMuted }]}>Motivazione · facoltativa</Text>
      <TextInput
        value={answer?.motivation ?? ''}
        onChangeText={(motivation) => setAnswer(q.id, { motivation })}
        placeholder="Perché? Es. un controesempio"
        placeholderTextColor={t.textMuted}
        multiline
        maxLength={8000}
        selectionColor={t.accentText}
        style={[styles.motivation, { backgroundColor: t.cell, color: t.text }]}
      />
      <Text style={{ color: t.textMuted, fontSize: 12 }}>Se scrivi una motivazione, conta anche lei nel voto.</Text>
    </View>
  );
}

function OpenAnswer({ q, answer }: { q: Extract<Question, { type: 'open' }>; answer?: Answer }) {
  const t = useTheme();
  const text = answer?.text ?? '';
  const selection = useRef({ start: text.length, end: text.length });
  const [focused, setFocused] = useState(false);

  const insert = (symbol: string) => {
    const { start, end } = selection.current;
    const next = text.slice(0, start) + symbol + text.slice(end);
    selection.current = { start: start + symbol.length, end: start + symbol.length };
    setAnswer(q.id, { text: next });
  };

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={(v) => setAnswer(q.id, { text: v })}
        onSelectionChange={(e) => (selection.current = e.nativeEvent.selection)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Scrivi la tua risposta…"
        placeholderTextColor={t.textMuted}
        multiline
        maxLength={8000}
        selectionColor={t.accentText}
        style={[styles.open, { backgroundColor: t.cell, color: t.text, borderColor: focused ? t.accent : 'transparent' }]}
      />
      <View style={styles.meta}>
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{text ? 'Salvata sul dispositivo' : ' '}</Text>
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{wordCount(text)} parole</Text>
      </View>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.symbols}>
        {SYMBOLS.map((sym) => (
          <Pressable
            key={sym}
            onPress={() => insert(sym)}
            accessibilityRole="button"
            accessibilityLabel={`Inserisci ${sym}`}
            style={({ pressed }) => [styles.symbol, { backgroundColor: pressed ? t.fill : t.cell }]}>
            <Text style={{ color: t.text, fontSize: 17 }}>{sym}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Explanation({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={{ color: t.textSecondary, fontSize: 13.5, lineHeight: 19, marginTop: 4 }}>{text}</Text>;
}

const styles = StyleSheet.create({
  prompt: { fontSize: 22, fontWeight: '600', lineHeight: 29, letterSpacing: -0.4, marginTop: 12 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, minHeight: 58, borderCurve: 'continuous' },
  letter: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tf: { flex: 1, height: 96, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6, borderCurve: 'continuous' },
  label: { fontSize: 12, letterSpacing: 0.24, textTransform: 'uppercase', marginTop: 12 },
  motivation: { borderRadius: 14, padding: 13, minHeight: 80, fontSize: 15.5, lineHeight: 21, textAlignVertical: 'top' },
  open: { borderRadius: 16, borderWidth: 1.5, padding: 14, minHeight: 180, fontSize: 16, lineHeight: 23, textAlignVertical: 'top' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginHorizontal: 4 },
  symbols: { gap: 6, paddingVertical: 10 },
  symbol: { minWidth: 40, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginTop: 24, paddingVertical: 6 },
});
