import { router, Stack } from 'expo-router';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { BigButton, StatusIcon } from '@/components/study/parts';
import { Banner, Cell, EmptyState, IconWell, ProgressBar, Screen, Section, SectionHeader } from '@/components/ui';
import { abortSession, closeReview, studyReview, submitSession, useShownSession } from '@/data/study';
import { basename } from '@/lib/paths';
import { useCloseSession } from '@/components/study/use-close-session';
import { routes } from '@/lib/routes';
import { durationText, TYPE_LABELS } from '@/lib/study-model';
import { useTheme, type Theme } from '@/theme';

/**
 * C1 — The grade: overall on the chosen scale, the closed/open split and the
 * duration, each criterion with its weight and a line of reasoning, then every
 * question. Streams in while the open answers are graded; the report note is
 * already in `studio/` when it ends.
 */
export default function ResultScreen() {
  const t = useTheme();
  const s = useShownSession();
  const reviewing = studyReview.useValue() !== null;
  const exit = useCloseSession();
  if (!s) return <EmptyState icon="school" title="Nessuna sessione" />;
  const r = s.result;

  const close = () => {
    if (reviewing) closeReview();
    // A graded session stays reachable from the tab until the next one starts.
    else if (s.phase !== 'graded') abortSession();
    exit();
  };

  const share = () => {
    if (!r) return;
    const lines = [
      `${r.grade.label}${r.grade.suffix} — ${r.headline}`,
      r.subline,
      ...r.criteria.map((c) => `${c.name} (${c.weight}%): ${c.score ?? '—'}/10`),
      s.savedPath ? `Report: ${s.savedPath}` : '',
    ];
    Share.share({ message: lines.filter(Boolean).join('\n') }).catch(() => {});
  };

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <HeaderItems
        left={[{ kind: 'button', label: 'Chiudi', icon: 'close', onPress: close }]}
        right={r ? [{ kind: 'button', label: 'Condividi', icon: 'share', onPress: share }] : []}
      />
      <Screen>
        {!r ? (
          s.phase === 'grade_failed' ? (
            <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
              <Icon name="warning" size={34} color={t.warning} />
              <Text style={[styles.headline, { color: t.text }]}>Valutazione non riuscita</Text>
              <Text style={{ color: t.textSecondary, textAlign: 'center' }}>{s.error}</Text>
              <BigButton label="Riprova" icon="restore" onPress={submitSession} style={{ alignSelf: 'stretch', marginTop: 16 }} />
              <BigButton label="Torna alle domande" variant="plain" onPress={() => router.replace(routes.studySession('quiz'))} style={{ alignSelf: 'stretch' }} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 64, gap: 14 }}>
              <ActivityIndicator color={t.accentText} size="large" />
              <Text style={[styles.headline, { color: t.text }]}>Sto valutando le tue risposte</Text>
              <Text style={{ color: t.textSecondary, textAlign: 'center' }}>
                {Object.keys(s.graded).length} di {s.questions.length} valutate. Le aperte le valuta l’AI con i tuoi criteri.
              </Text>
            </View>
          )
        ) : (
          <>
            <View style={{ alignItems: 'center', paddingTop: 12 }}>
              <Text style={[styles.grade, { color: t.text }]}>
                {r.grade.label}
                {r.grade.suffix.startsWith('/') ? <Text style={[styles.of, { color: t.textMuted }]}> su {r.grade.suffix.slice(1)}</Text> : r.grade.suffix}
              </Text>
              <Text style={[styles.headline, { color: t.text }]}>{r.headline}</Text>
              <Text style={{ color: t.textSecondary, textAlign: 'center', fontSize: 14.5, lineHeight: 20, marginTop: 4 }}>{r.subline}</Text>
            </View>

            <View style={styles.stats}>
              <Stat t={t} value={`${r.closedCorrect}/${r.closedTotal}`} label="Chiuse corrette" />
              {r.openAverage !== null ? <Stat t={t} value={`${r.openAverage.toLocaleString('it-IT')}/10`} label="Media aperte" /> : null}
              <Stat t={t} value={durationText(r.durationSec)} label="Durata" />
            </View>

            {r.criteria.some((c) => c.score !== null) ? (
              <>
                <SectionHeader>Per criterio · i tuoi pesi</SectionHeader>
                <View style={[styles.card, { backgroundColor: t.cell }]}>
                  {r.criteria.map((c) => (
                    <View key={c.id} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: t.text, fontSize: 15, fontWeight: '500' }}>
                          {c.name} · {c.weight}%
                        </Text>
                        <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{c.score === null ? '—' : `${c.score.toLocaleString('it-IT')}/10`}</Text>
                      </View>
                      <ProgressBar value={(c.score ?? 0) / 10} height={5} />
                      {c.note ? <Text style={{ color: t.textSecondary, fontSize: 13, lineHeight: 18 }}>{c.note}</Text> : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Section header="Domande">
              {s.questions.map((q, i) => {
                const qr = s.graded[q.id] ?? r.questions.find((x) => x.questionId === q.id);
                return (
                  <Cell
                    key={q.id}
                    icon={<StatusIcon result={qr} />}
                    title={`${i + 1} · ${q.topic || TYPE_LABELS[q.type]}`}
                    subtitle={`${TYPE_LABELS[q.type]}${qr && (q.type === 'open' || qr.criterionScores) ? ` · ${(Math.round(qr.score * 100) / 10).toLocaleString('it-IT')}/10` : ''}`}
                    chevron
                    onPress={() => router.push(routes.studyAnswer(q.id))}
                  />
                );
              })}
            </Section>

            {s.savedPath ? (
              <Section header="Report" inset={13}>
                <Cell icon={<IconWell name="doc" />} title={basename(s.savedPath)} mono subtitle="Salvato nella cartella studio/ del progetto" chevron onPress={() => router.push(routes.file(s.savedPath!))} />
              </Section>
            ) : s.saveError ? (
              <Banner icon="warning" tone="neutral" style={{ marginTop: 18 }}>
                {`${s.saveError}: il voto resta qui finché non chiudi la sessione.`}
              </Banner>
            ) : s.phase === 'grading' ? (
              <Text style={{ color: t.textMuted, fontSize: 12.5, marginTop: 14, textAlign: 'center' }}>Salvo il report…</Text>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}

function Stat({ t, value, label }: { t: Theme; value: string; label: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: t.cell }]}>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: t.textMuted, fontSize: 11.5, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grade: { fontSize: 64, fontWeight: '800', letterSpacing: -2 },
  of: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  headline: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', marginTop: 4 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 22 },
  stat: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', borderCurve: 'continuous' },
  card: { borderRadius: 16, padding: 14, gap: 16, borderCurve: 'continuous' },
});
