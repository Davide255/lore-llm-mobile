import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { router } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { Difficulty, QuestionType } from '@/api/study/types';
import { HeaderItems } from '@/components/header-items';
import { Stepper, TYPE_ICONS } from '@/components/study/parts';
import { SetupTitle } from '@/components/study/setup-header';
import { Cell, EmptyState, IconWell, Screen, Section, SectionHeader } from '@/components/ui';
import { studyDraft } from '@/data/study';
import { routes } from '@/lib/routes';
import { DIFFICULTY_LABELS, estimatedMinutes, MAX_PER_TYPE, MAX_TIME_LIMIT, MIN_TIME_LIMIT, stepError, timeLimitMinutes, totalQuestions, TYPE_LABELS } from '@/lib/study-model';
import { brand, useTheme } from '@/theme';

const SUBTITLES: Record<QuestionType, string> = {
  mc: '4 opzioni, una corretta',
  tf: 'Con motivazione facoltativa',
  open: 'Valutate con i tuoi criteri',
};
const DIFFICULTIES: Difficulty[] = ['ripasso', 'esame', 'orale'];
const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  ripasso: 'Domande dirette su definizioni ed esempi degli appunti.',
  esame: 'Il livello di uno scritto: distrattori plausibili, concetti da collegare.',
  orale: 'Come all’orale: enunciati con le ipotesi, giustificazioni, controesempi.',
};

/** A3 — Step 2 of 3: the mix of question types (a stepper each; 0 turns a type off), difficulty and options. */
export default function QuestionTypesScreen() {
  const t = useTheme();
  const draft = studyDraft.useValue();
  if (!draft) return <EmptyState icon="school" title="Nessuna sessione da preparare" />;

  const error = stepError(draft, 'types');
  const setCount = (type: QuestionType, n: number) =>
    studyDraft.set({ ...draft, counts: { ...draft.counts, [type]: n }, enabled: { ...draft.enabled, [type]: n > 0 } });
  const toggle = (key: 'correctionAtEnd' | 'citeSource' | 'timeLimit') => (v: boolean) => studyDraft.set({ ...draft, [key]: v });
  const total = totalQuestions(draft);
  const switchProps = { trackColor: { true: brand.purple, false: undefined }, thumbColor: '#fff', ios_backgroundColor: t.fill } as const;

  return (
    <>
      <SetupTitle step={2} />
      <HeaderItems
        right={[{ kind: 'button', label: 'Avanti', variant: 'prominent', disabled: !!error, onPress: () => router.push(routes.studySetup('criteria')) }]}
      />
      <Screen>
        <Section header="Tipi di domanda">
          {(['mc', 'tf', 'open'] as QuestionType[]).map((type) => {
            const n = draft.enabled[type] ? draft.counts[type] : 0;
            return (
              <Cell
                key={type}
                icon={<IconWell name={TYPE_ICONS[type]} />}
                title={TYPE_LABELS[type]}
                subtitle={SUBTITLES[type]}
                titleColor={n ? t.text : t.textMuted}
                right={<Stepper value={n} max={MAX_PER_TYPE} onChange={(v) => setCount(type, v)} />}
              />
            );
          })}
        </Section>
        <Text style={[styles.total, { color: error ? t.errorText : t.textSecondary }]}>
          {error ?? `Totale ${total} domande · ~${estimatedMinutes(draft)} min`}
        </Text>

        <SectionHeader>Difficoltà</SectionHeader>
        <SegmentedControl
          values={DIFFICULTIES.map((d) => DIFFICULTY_LABELS[d])}
          selectedIndex={DIFFICULTIES.indexOf(draft.difficulty)}
          onValueChange={(label) => studyDraft.set({ ...draft, difficulty: DIFFICULTIES.find((d) => DIFFICULTY_LABELS[d] === label)! })}
          appearance={t.scheme}
          tintColor={t.accent}
        />
        <Text style={[styles.hint, { color: t.textMuted }]}>{DIFFICULTY_HINTS[draft.difficulty]} La difficoltà cambia il tono, non il numero delle domande.</Text>

        <Section header="Opzioni" inset={13}>
          <Cell
            title="Correzione alla fine"
            subtitle={draft.correctionAtEnd ? 'Nessun feedback durante la sessione' : 'Le chiuse mostrano subito se sono giuste'}
            right={<Switch value={draft.correctionAtEnd} onValueChange={toggle('correctionAtEnd')} {...switchProps} />}
          />
          <Cell
            title="Cita la fonte"
            subtitle="Mostra da quale appunto viene la domanda"
            right={<Switch value={draft.citeSource} onValueChange={toggle('citeSource')} {...switchProps} />}
          />
          <Cell
            title="Limite di tempo"
            subtitle={draft.timeLimit ? 'Scaduto il tempo si va al riepilogo; niente pausa' : 'Nessun limite'}
            right={
              <Switch
                value={draft.timeLimit}
                onValueChange={(on) => studyDraft.set({ ...draft, timeLimit: on, ...(on ? { timeLimitMin: timeLimitMinutes(draft) } : {}) })}
                {...switchProps}
              />
            }
          />
          {draft.timeLimit ? (
            <Cell
              title="Durata"
              subtitle={`Per ${total} domande ne servono circa ${estimatedMinutes(draft)}`}
              right={
                <Stepper
                  value={timeLimitMinutes(draft)}
                  min={MIN_TIME_LIMIT}
                  max={MAX_TIME_LIMIT}
                  step={5}
                  suffix=" min"
                  onChange={(n) => studyDraft.set({ ...draft, timeLimitMin: n })}
                />
              }
            />
          ) : null}
        </Section>
        <View style={{ height: 24 }} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  total: { fontSize: 12.5, marginTop: 8, marginHorizontal: 6 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 8, marginHorizontal: 6 },
});
