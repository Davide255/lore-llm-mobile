import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { authUser } from '@/auth/session';
import { HeaderItems } from '@/components/header-items';
import { BigButton } from '@/components/study/parts';
import { Banner, Cell, IconWell, Screen, Section, SectionHeader } from '@/components/ui';
import { useProjects } from '@/data/hooks';
import { loadStudyPrefs, setStudyProject, studyDraft, studyProject, studySession, useStudyReports } from '@/data/study';
import { basename } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { dayLabel, defaultDraft, gradeText, trend, type SavedReport } from '@/lib/study-model';
import { brand, useTheme } from '@/theme';

/**
 * A1 / C3 — The Studio tab: greeting, one big button to start a session, then
 * the trend of the last sessions and the saved reports of the project it
 * follows (read back from `<project>/studio/`, so they are the same on every
 * device). The design's coach, streak, readiness ring and exam countdown are
 * not built: nothing records an exam date or a daily goal yet.
 */
export default function StudyScreen() {
  const t = useTheme();
  const user = authUser.useValue();
  const projects = useProjects();
  const chosen = studyProject.useValue();
  const session = studySession.useValue();

  useEffect(() => {
    loadStudyPrefs();
  }, []);

  const list = projects.data ?? [];
  const project = list.find((p) => p.name === chosen) ?? list[0] ?? null;
  const reports = useStudyReports(project?.name ?? null);
  const saved = reports.data ?? [];
  const recent = trend(saved);

  const start = () => {
    if (!project) return;
    const previous = studyDraft.get();
    // Keep the last session's settings, start from fresh notes.
    studyDraft.set(previous ? { ...previous, project: project.name, sources: [] } : defaultDraft(project.name));
    router.push(routes.studySetup());
  };

  const inProgress = session && session.phase !== 'graded' ? session : null;
  const firstName = user?.name?.split(' ')[0];
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <Stack.Screen options={{ title: 'Studio' }} />
      {list.length > 1 ? (
        <HeaderItems
          right={[
            {
              kind: 'menu',
              label: 'Progetto',
              icon: 'tune',
              title: 'Progetto da studiare',
              items: list.map((p) => ({ label: p.title, selected: p.name === project?.name, onPress: () => setStudyProject(p.name) })),
            },
          ]}
        />
      ) : null}
      <Screen refreshControl={<RefreshControl refreshing={reports.refreshing} onRefresh={reports.refresh} />}>
        <View style={[styles.hero, { backgroundColor: t.cell }]}>
          <Text style={{ color: t.textMuted, fontSize: 13, textTransform: 'capitalize' }}>{today}</Text>
          <Text style={[styles.hello, { color: t.text }]}>
            {firstName ? `Ciao ${firstName},` : 'Ciao,'}
            {'\n'}
            <Text style={{ color: t.accentText }}>{project ? `si studia ${project.title}.` : 'crea un progetto con i tuoi appunti.'}</Text>
          </Text>
          {recent.length >= 2 ? <Delta reports={recent} /> : null}
          <BigButton label={inProgress ? 'Nuova sessione' : 'Inizia una sessione'} icon="play" onPress={start} disabled={!project} style={{ marginTop: 18 }} />
        </View>

        {inProgress ? (
          <Section header="Sessione in corso" inset={13}>
            <Cell
              icon={<IconWell name="school" />}
              title={inProgress.phase === 'generating' ? 'Sto preparando le domande' : `${inProgress.questions.length} domande`}
              subtitle={phaseText(inProgress.phase)}
              chevron
              onPress={() => router.push(routes.studySession(resumeScreen(inProgress.phase)))}
            />
          </Section>
        ) : null}

        {recent.length ? (
          <>
            <SectionHeader>{recent.length === 1 ? 'La tua prima sessione' : `Andamento ultime ${recent.length} sessioni`}</SectionHeader>
            <TrendChart reports={recent} />
          </>
        ) : null}

        {saved.length ? (
          <Section header="Report salvati">
            {saved.slice(0, 8).map((r) => (
              <Cell
                key={r.path}
                icon={<IconWell name="doc" />}
                title={basename(r.path)}
                mono
                subtitle={`${gradeText(r.data.grade)} · ${r.data.headline} · ${dayLabel(r.data.date)}`}
                chevron
                onPress={() => router.push(routes.file(r.path))}
              />
            ))}
          </Section>
        ) : null}

        <Banner icon="index" style={{ marginTop: 20 }}>
          {saved.length
            ? 'Ogni sessione diventa un file .md nella cartella studio/ del progetto: index.md e gli agenti collegati lo vedono subito.'
            : 'L’AI fa domande sui tuoi appunti (note .md, PDF e foto) e le valuta con i tuoi criteri. Il report finisce nella cartella studio/ del progetto.'}
        </Banner>
      </Screen>
    </>
  );
}

function phaseText(phase: string): string {
  switch (phase) {
    case 'generating':
      return 'L’AI sta leggendo gli appunti';
    case 'generate_failed':
      return 'Preparazione non riuscita: tocca per riprovare';
    case 'grading':
      return 'Valutazione in corso';
    case 'grade_failed':
      return 'Valutazione non riuscita: tocca per riprovare';
    default:
      return 'Riprendi da dove eri rimasto';
  }
}

function resumeScreen(phase: string): 'generating' | 'quiz' | 'result' {
  if (phase === 'generating' || phase === 'generate_failed') return 'generating';
  if (phase === 'grading' || phase === 'grade_failed') return 'result';
  return 'quiz';
}

function Delta({ reports }: { reports: SavedReport[] }) {
  const t = useTheme();
  const last = reports[reports.length - 1]!.data.grade.fraction;
  const prev = reports[reports.length - 2]!.data.grade.fraction;
  const diff = Math.round((last - prev) * 100);
  if (!diff) return null;
  return (
    <Text style={{ marginTop: 8, fontSize: 13, color: diff > 0 ? t.successText : t.errorText }}>
      {diff > 0 ? '+' : ''}
      {diff}% rispetto alla sessione precedente
    </Text>
  );
}

/** C3 — Bars of the last sessions; the latest is highlighted. */
function TrendChart({ reports }: { reports: SavedReport[] }) {
  const t = useTheme();
  return (
    <View style={[styles.chart, { backgroundColor: t.cell }]}>
      {reports.map((r, i) => {
        const last = i === reports.length - 1;
        return (
          <View key={r.path} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: last ? t.text : t.textSecondary }}>{r.data.grade.label}</Text>
            <View style={{ height: 90, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
              <View
                style={{
                  width: 26,
                  height: Math.max(6, r.data.grade.fraction * 90),
                  borderRadius: 7,
                  backgroundColor: last ? brand.purple : t.accentSoft,
                  experimental_backgroundImage: last ? 'linear-gradient(180deg, #a37aff 0%, #8f5cff 100%)' : undefined,
                }}
              />
            </View>
            <Text style={{ fontSize: 11, color: t.textMuted }}>{r.data.date.slice(8, 10)}/{r.data.date.slice(5, 7)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 18, marginTop: 8, borderCurve: 'continuous' },
  hello: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, lineHeight: 30, marginTop: 6 },
  chart: { flexDirection: 'row', gap: 8, borderRadius: 16, padding: 14, borderCurve: 'continuous' },
});
