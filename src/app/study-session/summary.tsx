import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BigButton, FooterBar } from '@/components/study/parts';
import { Banner, Cell, EmptyState, IconWell, Screen, Section } from '@/components/ui';
import { goTo, studySession, submitSession } from '@/data/study';
import { routes } from '@/lib/routes';
import { gridStates, TYPE_LABELS, type GridState } from '@/lib/study-model';
import { useTheme, type Theme } from '@/theme';

const LEGEND: Record<GridState, string> = { answered: 'Risposta', flagged: 'Da rivedere', empty: 'Vuota' };

/** B5 — Before handing in: a grid of what is answered, flagged or empty; tapping a number goes back to it. */
export default function SummaryScreen() {
  const t = useTheme();
  const s = studySession.useValue();
  if (!s) return <EmptyState icon="school" title="Nessuna sessione in corso" />;

  const states = gridStates(s.questions, s.answers, new Set(s.flagged));
  const pending = s.questions.map((q, i) => ({ q, i, state: states[i]! })).filter((x) => x.state !== 'answered');
  const open = (i: number) => {
    goTo(i);
    if (router.canGoBack()) router.back();
    else router.replace(routes.studySession('quiz'));
  };
  const handIn = () => {
    submitSession();
    router.replace(routes.studySession('result'));
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Riepilogo' }} />
      <Screen>
        <View style={[styles.grid, { backgroundColor: t.cell }]}>
          {states.map((st, i) => (
            <Pressable key={s.questions[i]!.id} onPress={() => open(i)} accessibilityRole="button" accessibilityLabel={`Domanda ${i + 1}, ${LEGEND[st]}`} style={[styles.dot, dotStyle(t, st)]}>
              <Text style={{ color: st === 'answered' ? '#fff' : st === 'flagged' ? t.warning : t.textSecondary, fontWeight: '600', fontSize: 15 }}>{i + 1}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.legend}>
          {(Object.keys(LEGEND) as GridState[]).map((st) => (
            <View key={st} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[{ width: 12, height: 12, borderRadius: 6 }, dotStyle(t, st)]} />
              <Text style={{ color: t.textSecondary, fontSize: 12.5 }}>{LEGEND[st]}</Text>
            </View>
          ))}
        </View>

        {pending.length ? (
          <Section header="Da controllare">
            {pending.map(({ q, i, state }) => (
              <Cell
                key={q.id}
                icon={<IconWell name={state === 'flagged' ? 'flagFill' : 'circle'} color={state === 'flagged' ? t.warning : t.textMuted} />}
                title={`Domanda ${i + 1} · ${state === 'flagged' ? 'da rivedere' : 'senza risposta'}`}
                subtitle={state === 'flagged' ? q.prompt : TYPE_LABELS[q.type]}
                chevron
                onPress={() => open(i)}
              />
            ))}
          </Section>
        ) : null}

        <Banner icon="info" style={{ marginTop: 18 }}>
          {`Le domande vuote valgono 0. Valutazione ${s.draft.presetName ? `secondo il preset «${s.draft.presetName}»` : 'con i tuoi criteri'}, scala ${s.draft.scale === 'percent' ? '%' : s.draft.scale === 'judgement' ? 'a giudizio' : `/${s.draft.scale}`}.`}
        </Banner>
      </Screen>
      <FooterBar>
        <View style={{ flex: 1, gap: 6 }}>
          <BigButton label="Consegna e valuta" icon="checkCircle" onPress={handIn} />
          <BigButton label="Continua a rispondere" variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.studySession('quiz')))} />
        </View>
      </FooterBar>
    </>
  );
}

function dotStyle(t: Theme, st: GridState) {
  if (st === 'answered') return { backgroundColor: t.accent };
  if (st === 'flagged') return { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.warning };
  return { backgroundColor: t.fill };
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16, borderRadius: 18, marginTop: 10, justifyContent: 'center', borderCurve: 'continuous' },
  dot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
});
