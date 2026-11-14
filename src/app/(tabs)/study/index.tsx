import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, Easing, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { Banner, Cell, IconWell, Screen, Section, SectionHeader } from '@/components/ui';
import { useProjects } from '@/data/hooks';
import { loadStudyPrefs, openReview, resumeSession, setStudyProject, studyDraft, studyProject, studySession, useStudyReports } from '@/data/study';
import { basename } from '@/lib/paths';
import { haptic } from '@/lib/haptics';
import { routes } from '@/lib/routes';
import {
  coachMessage,
  dayLabel,
  defaultDraft,
  estimatedMinutes,
  gradeText,
  masteryLabel,
  readiness,
  streakDays,
  thisWeek,
  topicMastery,
  trend,
  type SavedReport,
  type TopicMastery,
} from '@/lib/study-model';
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
  const topics = topicMastery(saved).slice(0, 8);
  const coach = coachMessage(saved, topics);

  const start = () => {
    if (!project) return;
    const previous = studyDraft.get();
    // Keep the last session's settings, start from fresh notes.
    // «Orale» isn't available yet: a draft left on it goes back to «Esame».
    studyDraft.set(
      previous ? { ...previous, project: project.name, sources: [], difficulty: previous.difficulty === 'orale' ? 'esame' : previous.difficulty } : defaultDraft(project.name),
    );
    router.push(routes.studySetup());
  };

  const inProgress = session && session.phase !== 'graded' ? session : null;

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
        <Animated.View entering={FadeInDown.duration(420)} style={{ paddingHorizontal: 2, paddingTop: 4, paddingBottom: 14 }}>
          <Text style={[styles.hello, { color: t.accentText }]}>{project ? headline(topics, project.title) : 'Crea un progetto con i tuoi appunti.'}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(460)}>
          <Hero project={project?.title ?? null} reports={saved} minutes={estimatedMinutes(studyDraft.get() ?? defaultDraft(''))} onStart={start} disabled={!project} inProgress={!!inProgress} />
        </Animated.View>

        {saved.length ? (
          <Animated.View entering={FadeInDown.delay(160).duration(460)}>
            <Streak dates={saved.map((r) => r.data.date)} />
          </Animated.View>
        ) : null}

        {coach ? (
          <Animated.View entering={FadeInDown.delay(240).duration(460)} style={[styles.coach, { backgroundColor: t.cell }]}>
            <View style={[styles.coachIcon, { experimental_backgroundImage: brand.gradient, backgroundColor: brand.purple }]}>
              <Icon name="index" size={15} color="#fff" />
            </View>
            <Text style={{ flex: 1, color: t.textBody, fontSize: 13.5, lineHeight: 20 }}>{coach}</Text>
          </Animated.View>
        ) : null}

        {topics.length ? (
          <>
            <SectionHeader>I tuoi argomenti</SectionHeader>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
              {topics.map((m, i) => (
                <Animated.View key={m.topic} entering={FadeInDown.delay(300 + i * 50).duration(400)}>
                  <TopicCard m={m} />
                </Animated.View>
              ))}
            </ScrollView>
          </>
        ) : null}

        {inProgress ? (
          <Section header="Sessione in corso" inset={13}>
            <Cell
              icon={<IconWell name="school" />}
              title={inProgress.phase === 'generating' ? 'Sto preparando le domande' : `${inProgress.questions.length} domande`}
              subtitle={inProgress.pausedAt ? 'In pausa · tocca per riprendere' : phaseText(inProgress.phase)}
              chevron
              onPress={() => {
                resumeSession();
                router.push(routes.studySession(resumeScreen(inProgress.phase)));
              }}
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
                onPress={async () => {
                  // The full session when this device has it, else the report note.
                  if (await openReview(r.path)) router.push(routes.studySession('result'));
                  else router.push(routes.file(r.path));
                }}
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

function headline(topics: TopicMastery[], title: string): string {
  const weak = topics[0];
  return weak && weak.score < 0.6 ? `Oggi tocca a ${weak.topic}.` : `Oggi si studia ${title}.`;
}

/** A1 — The hero: readiness ring, the project, the last grade and its trend, one big button. */
function Hero({ project, reports, minutes, onStart, disabled, inProgress }: { project: string | null; reports: SavedReport[]; minutes: number; onStart: () => void; disabled: boolean; inProgress: boolean }) {
  const ready = readiness(reports);
  const recent = trend(reports, 5);
  const last = recent.at(-1)?.data.grade;
  const prev = recent.at(-2)?.data.grade;
  const diff = last && prev ? Math.round((last.fraction - prev.fraction) * 100) : 0;
  return (
    <View style={styles.hero}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ring value={ready} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.heroKicker}>
            {project ?? 'Nessun progetto'}
          </Text>
          <Text numberOfLines={1} style={styles.heroTitle}>
            {last ? `ultimo ${gradeText(last)}` : 'Prima sessione'}
          </Text>
          {diff ? (
            <View style={[styles.deltaPill, { backgroundColor: diff > 0 ? 'rgba(92,200,124,0.2)' : 'rgba(255,107,107,0.2)' }]}>
              <Icon name="trendUp" size={12} color={diff > 0 ? '#8ee6a6' : '#ffb0b0'} />
              <Text style={{ color: diff > 0 ? '#8ee6a6' : '#ffb0b0', fontSize: 11, fontWeight: '600' }}>
                {diff > 0 ? '+' : ''}
                {diff}% dalla precedente
              </Text>
            </View>
          ) : (
            <Text style={styles.heroSub}>{last ? `${reports.length} ${reports.length === 1 ? 'sessione' : 'sessioni'} salvate` : 'L’AI ti interroga sui tuoi appunti.'}</Text>
          )}
        </View>
      </View>
      <Pressable
        onPress={() => {
          haptic.tap();
          onStart();
        }}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [[styles.heroButton, { opacity: disabled ? 0.5 : 1 }], pressed && { opacity: 0.85 }]}>
        <Icon name="play" size={18} color="#141413" />
        <Text style={{ color: '#141413', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 }}>{inProgress ? 'Nuova sessione' : `Studia ${minutes} minuti`}</Text>
      </Pressable>
    </View>
  );
}

function Ring({ value }: { value: number | null }) {
  const size = 76;
  const r = 31;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.round(value * 100);
  // The ring fills from empty when the tab opens, and glides when the value changes.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(value === null ? 0 : Math.max(0.02, value), { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [value, progress]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - progress.get()) }));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.16)" strokeWidth={7} fill="none" />
        {value !== null ? (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="#fff"
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c}`}
            animatedProps={arc}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.6 }}>{value === null ? '—' : `${pct}%`}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '600', marginTop: 2 }}>pronto</Text>
      </View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Today, still to do: a ring that breathes, asking for a session. */
function TodayDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })), -1));
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.35 - pulse.get() * 0.3, transform: [{ scale: 1 + pulse.get() * 0.35 }] }));
  return (
    <View style={styles.day}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 14, backgroundColor: '#ff8a3d' }, halo]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: 14, borderWidth: 2, borderColor: '#ff8a3d' }]} />
    </View>
  );
}

/** A1 — Days in a row, and this week's days with a session. */
function Streak({ dates }: { dates: string[] }) {
  const t = useTheme();
  const n = streakDays(dates);
  const week = thisWeek(dates);
  const todayDone = week.some((d) => d.today && d.done);
  return (
    <View style={[styles.streak, { backgroundColor: t.cell, borderColor: 'rgba(255,138,61,0.16)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Icon name="flame" size={24} color="#ff8a3d" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.3 }}>
            {n === 0 ? 'Nessuna serie aperta' : n === 1 ? '1 giorno di fila' : `${n} giorni di fila`}
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 12, marginTop: 1 }}>
            {todayDone ? 'Oggi fatto: la serie è al sicuro.' : n ? 'Una sessione oggi e la serie continua.' : 'Una sessione oggi per cominciarne una.'}
          </Text>
        </View>
      </View>
      <View style={styles.week}>
        {week.map((d, i) => (
          <View key={d.date} style={{ alignItems: 'center', gap: 6 }}>
            {d.done ? (
              <Animated.View
                entering={FadeIn.delay(260 + i * 60).duration(200)}
                style={[styles.day, { experimental_backgroundImage: 'linear-gradient(160deg, #ffb547 0%, #ff6a3d 100%)', backgroundColor: '#ff8a3d', boxShadow: '0 3px 10px rgba(255,106,61,0.35)' }]}>
                <Icon name="check" size={13} color="#fff" weight="bold" />
              </Animated.View>
            ) : d.today ? (
              <TodayDot />
            ) : (
              <View style={[styles.day, { backgroundColor: t.fill }]} />
            )}
            <Text style={{ color: d.today ? '#ffb070' : t.textMuted, fontSize: 10.5, fontWeight: '600' }}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TopicCard({ m }: { m: TopicMastery }) {
  const t = useTheme();
  const color = m.score >= 0.8 ? t.success : m.score >= 0.5 ? brand.purple : t.warning;
  return (
    <View style={[styles.topic, { backgroundColor: t.cell }]}>
      <Text numberOfLines={1} style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>
        {m.topic}
      </Text>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, marginVertical: 8, overflow: 'hidden' }}>
        <View
          style={{
            width: `${Math.max(4, m.score * 100)}%`,
            height: '100%',
            borderRadius: 2,
            backgroundColor: color,
            experimental_backgroundImage: m.score >= 0.5 && m.score < 0.8 ? brand.gradient : undefined,
          }}
        />
      </View>
      <Text style={{ color: t.textMuted, fontSize: 11 }}>{masteryLabel(m.score)}</Text>
    </View>
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
  hello: { fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 32 },
  hero: {
    borderRadius: 22,
    padding: 16,
    borderCurve: 'continuous',
    backgroundColor: '#1d1a2b',
    experimental_backgroundImage: 'linear-gradient(135deg, rgba(58,134,255,0.55) 0%, rgba(29,26,43,0) 55%), linear-gradient(315deg, rgba(143,92,255,0.75) 0%, #1d1a2b 70%)',
    boxShadow: '0 14px 34px rgba(91,60,200,0.28)',
  },
  heroKicker: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 23, fontWeight: '800', letterSpacing: -0.7, marginTop: 5 },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 7, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999 },
  heroButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, marginTop: 14, borderRadius: 14, backgroundColor: '#fff', borderCurve: 'continuous' },
  streak: { borderRadius: 18, padding: 14, marginTop: 10, borderWidth: 1, borderCurve: 'continuous' },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 2 },
  day: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  coach: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10, padding: 13, borderRadius: 18, borderCurve: 'continuous' },
  coachIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  topic: { width: 118, borderRadius: 14, padding: 11, borderCurve: 'continuous' },
  chart: { flexDirection: 'row', gap: 8, borderRadius: 16, padding: 14, borderCurve: 'continuous' },
});
