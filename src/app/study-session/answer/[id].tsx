import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { Highlight, Question } from '@/api/study/types';
import { sourceIcon, StatusIcon, TypeChip } from '@/components/study/parts';
import { Cell, EmptyState, HeaderTitle, IconWell, Screen, Section, SectionHeader } from '@/components/ui';
import { useShownSession } from '@/data/study';
import { attachmentKind } from '@/lib/attachments';
import { basename } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { TYPE_LABELS } from '@/lib/study-model';
import { useTheme, type Theme } from '@/theme';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * C2 — One answer after grading: the question, the answer with what earned
 * points (green) and what was wrong (red) underlined, the AI's comment, the
 * score per criterion, and the note it came from. «Contesta» and «Riprova»
 * are not built in this version.
 */
export default function AnswerDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useShownSession();
  const index = s?.questions.findIndex((q) => q.id === id) ?? -1;
  const q = s?.questions[index];
  if (!s || !q) return <EmptyState icon="school" title="Domanda non trovata" />;

  const answer = s.answers[q.id];
  const result = s.graded[q.id] ?? s.result?.questions.find((r) => r.questionId === q.id);
  const scored = result?.criterionScores;
  const outOfTen = result ? `${(Math.round(result.score * 100) / 10).toLocaleString('it-IT')}/10` : '';
  const written = q.type === 'open' ? answer?.text : q.type === 'tf' ? answer?.motivation : undefined;

  const openSource = () => {
    if (!q.source) return;
    router.push(attachmentKind(q.source.path) ? routes.attachment(q.source.path) : routes.file(q.source.path, q.source.locator || null));
  };

  return (
    <>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle title={`Domanda ${index + 1}`} subtitle={`${TYPE_LABELS[q.type]}${result ? ` · ${outOfTen}` : ''}`} mono={false} /> }}
      />
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <StatusIcon result={result} />
          <TypeChip type={q.type} />
        </View>
        <Text style={[styles.prompt, { color: t.text }]}>{q.prompt}</Text>

        {q.type !== 'open' ? <ClosedAnswer q={q} choice={answer?.choice} value={answer?.value} /> : null}

        {written?.trim() ? (
          <>
            <SectionHeader>{q.type === 'tf' ? 'La tua motivazione' : 'La tua risposta'}</SectionHeader>
            <View style={[styles.box, { backgroundColor: t.cell }]}>
              <Highlighted text={written} highlights={result?.highlights ?? []} t={t} />
            </View>
          </>
        ) : q.type === 'open' ? (
          <Text style={{ color: t.textMuted, marginTop: 16 }}>Nessuna risposta: vale 0.</Text>
        ) : null}

        {result?.comment ? (
          <>
            <SectionHeader>Commento dell’AI</SectionHeader>
            <Text style={[styles.comment, { color: t.textBody }]}>{result.comment}</Text>
          </>
        ) : null}

        {scored ? (
          <>
            <SectionHeader>Punteggio per criterio</SectionHeader>
            <View style={styles.scores}>
              {s.draft.criteria.map((c) => (
                <View key={c.id} style={[styles.score, { backgroundColor: t.cell }]}>
                  <Text style={{ color: t.textSecondary, fontSize: 12 }}>{c.name}</Text>
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{scored[c.id] ?? '—'}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {q.type === 'open' ? (
          <Section header="Punti attesi" inset={13}>
            {q.expectedPoints.map((p) => (
              <Cell key={p} title={p} />
            ))}
          </Section>
        ) : null}

        {q.source ? (
          <Section header="Vedi negli appunti">
            <Cell
              icon={<IconWell name={sourceIcon(q.source.path)} />}
              title={basename(q.source.path)}
              subtitle={q.source.locator || undefined}
              chevron
              onPress={openSource}
            />
          </Section>
        ) : null}
      </Screen>
    </>
  );
}

function ClosedAnswer({ q, choice, value }: { q: Exclude<Question, { type: 'open' }>; choice?: number; value?: boolean }) {
  const t = useTheme();
  if (q.type === 'mc') {
    return (
      <View style={{ gap: 8, marginTop: 18 }}>
        {q.options.map((o, i) => {
          const right = i === q.correctIndex;
          const mine = i === choice;
          return (
            <View
              key={i}
              style={[styles.option, { backgroundColor: right ? t.successSoft : mine ? t.errorSoft : t.cell, borderColor: right ? t.success : mine ? t.error : 'transparent' }]}>
              <Text style={{ color: t.textSecondary, fontWeight: '700', width: 18 }}>{LETTERS[i]}</Text>
              <Text style={{ flex: 1, color: t.text, fontSize: 15.5 }}>{o}</Text>
              {mine ? <Text style={{ color: t.textMuted, fontSize: 12 }}>la tua</Text> : null}
            </View>
          );
        })}
        <Text style={[styles.comment, { color: t.textSecondary }]}>{q.explanation}</Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 18, gap: 6 }}>
      <Text style={{ color: t.text, fontSize: 15.5 }}>
        Hai risposto <Text style={{ fontWeight: '700' }}>{value === undefined ? '—' : value ? 'Vero' : 'Falso'}</Text>; è{' '}
        <Text style={{ fontWeight: '700', color: t.successText }}>{q.correct ? 'Vero' : 'Falso'}</Text>.
      </Text>
      <Text style={[styles.comment, { color: t.textSecondary }]}>{q.explanation}</Text>
    </View>
  );
}

/** The answer with the graded quotes underlined (first occurrence of each). */
function Highlighted({ text, highlights, t }: { text: string; highlights: Highlight[]; t: Theme }) {
  const marks = highlights
    .map((h) => ({ ...h, at: text.indexOf(h.quote) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const parts: { text: string; kind?: Highlight['kind'] }[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.at < pos) continue;
    if (m.at > pos) parts.push({ text: text.slice(pos, m.at) });
    parts.push({ text: m.quote, kind: m.kind });
    pos = m.at + m.quote.length;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return (
    <Text style={{ color: t.text, fontSize: 15.5, lineHeight: 23 }}>
      {parts.map((p, i) =>
        p.kind ? (
          <Text
            key={i}
            style={{
              backgroundColor: p.kind === 'good' ? t.successSoft : t.errorSoft,
              textDecorationLine: 'underline',
              textDecorationColor: p.kind === 'good' ? t.success : t.error,
            }}>
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  prompt: { fontSize: 19, fontWeight: '600', lineHeight: 26, letterSpacing: -0.3, marginTop: 14 },
  box: { borderRadius: 14, padding: 14, borderCurve: 'continuous' },
  comment: { fontSize: 15, lineHeight: 22 },
  scores: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  score: { minWidth: 76, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, alignItems: 'center', borderCurve: 'continuous' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderCurve: 'continuous' },
});
