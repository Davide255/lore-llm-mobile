import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { Project, SearchHit, SearchResponse } from '@/api';
import { Icon, type IconName } from '@/components/icon';
import { actions, useRecentSearches, useSearch, useStars } from '@/data/hooks';
import { plural } from '@/lib/format';
import { projectLabel, teamOf } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { folderTrail, groupByProject, noteTitle, visibleSnippet } from '@/lib/search-view';
import { starredFirst } from '@/lib/starred';
import { fonts, useTheme, type Theme } from '@/theme';

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const tap = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
};

/** Search is quick, so it stays calm: one short fade for everything that appears or goes. */
const FADE_IN = FadeIn.duration(120);
const FADE_OUT = FadeOut.duration(90);

// ─── Building blocks ─────────────────────────────────────────────────────────

/** A pressable that dips slightly under the finger. */
function PressScale({ onPress, style, children, accessibilityLabel }: { onPress: () => void; style?: object; children: ReactNode; accessibilityLabel?: string }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => scale.set(withTiming(0.98, { duration: 70 }))}
      onPressOut={() => scale.set(withTiming(1, { duration: 90 }))}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

function Heading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.heading}>
      <Text style={[styles.headingText, { color: t.textMuted }]}>{children}</Text>
      {right}
    </View>
  );
}

/** Highlighted snippet: the matched words in accent colour on a soft wash. */
function Snippet({ hit, t, lines = 2 }: { hit: SearchHit; t: Theme; lines?: number }) {
  const snippet = visibleSnippet(hit);
  if (!snippet) return null;
  const { text, highlights } = snippet;
  const parts: ReactNode[] = [];
  let cursor = 0;
  highlights.forEach(([s, e], i) => {
    if (s > cursor) parts.push(text.slice(cursor, s));
    parts.push(
      <Text key={i} style={{ color: t.accentText, fontWeight: '600', backgroundColor: t.accentSoft }}>
        {text.slice(s, e)}
      </Text>,
    );
    cursor = e;
  });
  parts.push(text.slice(cursor));
  return (
    <Text numberOfLines={lines} style={{ fontSize: 13.5, lineHeight: 19.5, color: t.textSecondary }}>
      {parts}
    </Text>
  );
}

function hitIcon(hit: SearchHit, t: Theme): { name: IconName; color: string; well: string } {
  if (hit.role === 'index') return { name: 'index', color: t.info, well: t.infoWell };
  if (hit.role === 'checklist') return { name: 'checklist', color: t.accentText, well: t.accentWell };
  return { name: 'doc', color: t.textSecondary, well: t.fill };
}

// ─── Recent searches ─────────────────────────────────────────────────────────

/** Recent searches as chips, shown while the search bar is focused and empty. */
export function RecentSearches({ onPick }: { onPick: (q: string) => void }) {
  const t = useTheme();
  const recent = useRecentSearches().data ?? [];
  if (!recent.length) return null;
  return (
    <Animated.View entering={FADE_IN} exiting={FADE_OUT}>
      <Heading
        right={
          <Pressable hitSlop={10} onPress={() => recent.forEach((q) => actions.removeRecentSearch(q))} accessibilityRole="button">
            <Text style={{ fontSize: 13, color: t.accentText }}>Cancella</Text>
          </Pressable>
        }>
        Ricerche recenti
      </Heading>
      <View style={styles.chips}>
        {recent.map((q, i) => (
          <Animated.View key={q} entering={FADE_IN} exiting={FADE_OUT}>
            <PressScale onPress={() => onPick(q)} style={[styles.recent, { backgroundColor: t.cell, borderColor: t.hairline }]} accessibilityLabel={`Cerca ${q}`}>
              <Icon name="history" size={14} color={t.textMuted} />
              <Text numberOfLines={1} style={{ fontSize: 14, color: t.text, maxWidth: 200 }}>
                {q}
              </Text>
              <Pressable hitSlop={10} onPress={() => actions.removeRecentSearch(q)} accessibilityLabel={`Rimuovi ${q}`}>
                <Icon name="close" size={11} color={t.textMuted} />
              </Pressable>
            </PressScale>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

/**
 * Global search results (D2): projects whose name matches, then the notes, ranked by
 * the server — the best match on its own card, the rest grouped by project. Project
 * chips filter on the device, so switching is instant.
 */
export function GlobalSearchResults({
  query,
  projects,
  renderProject,
}: {
  query: string;
  projects: Project[];
  /** Row for a project whose name matches (the home screen's own row, with star and progress). */
  renderProject: (p: Project) => ReactNode;
}) {
  const t = useTheme();
  const [project, setProject] = useState<string | null>(null);
  const results = useSearch(query, null);
  const stars = useStars();
  const starredPaths = new Set((stars.data ?? []).map((s) => s.path));
  const isStarred = (name: string) => starredPaths.has(name);

  // Keep the previous answer on screen while the next one loads: no flash between keystrokes.
  const [shown, setShown] = useState<SearchResponse | undefined>(results.data);
  if (results.data && results.data !== shown) setShown(results.data);
  const loading = results.loading || results.refreshing;
  const data = shown;

  // A filter for a project that no longer has hits falls back to all.
  const counts = new Map(data?.byProject.map((b) => [b.project, b.matches]));
  const filter = project && counts.has(project) ? project : null;

  const q = query.toLowerCase();
  const matchingProjects = filter ? [] : starredFirst(projects.filter((p) => p.title.toLowerCase().includes(q)), (p) => isStarred(p.name));
  const hits = starredFirst(
    (data?.hits ?? []).filter((h) => !filter || h.project === filter),
    (h) => isStarred(h.path) || isStarred(h.project),
  );
  const matches = hits.reduce((n, h) => n + 1 + h.extraMatches, 0);
  const [top, ...rest] = hits;
  // A best match is worth a card only when there is something to pick it from.
  const showTop = !!top && !filter && hits.length > 2;
  const groups = groupByProject(showTop ? rest : hits);

  const pick = (p: string | null) => {
    tap();
    setProject(p);
  };
  const open = (hit: SearchHit) => {
    actions.addRecentSearch(query);
    router.push(routes.file(hit.path));
  };

  if (!data) return <Skeleton />;

  const empty = hits.length === 0 && matchingProjects.length === 0;
  // Position of each group's first row, for the staggered entrance across groups.
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.hits.length, 0));

  return (
    <View>
      {matchingProjects.length > 0 && (
        <Animated.View entering={FADE_IN}>
          <Heading>{plural(matchingProjects.length, 'progetto', 'progetti')}</Heading>
          <View style={[styles.card, { backgroundColor: t.cell }]}>
            {matchingProjects.map((p, i) => (
              <Animated.View key={p.name} entering={FADE_IN}>
                {i > 0 && <View style={[styles.separator, { backgroundColor: t.hairline }]} />}
                {renderProject(p)}
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      )}

      {counts.size > 0 && (
        <Animated.View entering={FADE_IN}>
          <Heading right={<Status loading={loading} t={t} />}>
            {`${plural(matches, 'risultato', 'risultati')} · ${plural(hits.length, 'nota', 'note')}`}
          </Heading>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ marginHorizontal: -16 }}>
            <FilterChip label="Tutti" count={data.hits.length} active={!filter} onPress={() => pick(null)} />
            {starredFirst([...counts.keys()], isStarred).map((p) => (
              <FilterChip key={p} label={projectLabel(p)} team={!!teamOf(p)} count={counts.get(p)!} active={filter === p} onPress={() => pick(filter === p ? null : p)} />
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {empty ? (
        <EmptyResults query={query} t={t} />
      ) : (
        <>
          {showTop && (
            <Animated.View key={`top:${top.path}`} entering={FADE_IN} style={{ marginTop: 6 }}>
              <PressScale onPress={() => open(top)} style={[styles.top, { backgroundColor: t.cellRaised, borderColor: t.accentSoft }]} accessibilityLabel={`Apri ${top.name}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="starFill" size={11} color={t.accentText} />
                  <Text style={[styles.eyebrow, { color: t.accentText }]}>Migliore corrispondenza</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[styles.well, { width: 40, height: 40, borderRadius: 12, backgroundColor: t.accentWell }]}>
                    <Icon name={hitIcon(top, t).name} size={20} color={t.accentText} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', color: t.text }}>
                      {noteTitle(top.name)}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>
                      {[projectLabel(top.project), folderTrail(top.path)].filter(Boolean).join(' / ')}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={13} weight="semibold" color={t.textMuted} />
                </View>
                <Snippet hit={top} t={t} lines={3} />
              </PressScale>
            </Animated.View>
          )}

          {groups.map((g, gi) => (
            <Animated.View key={g.project} entering={FADE_IN} exiting={FADE_OUT}>
              <Heading>
                {`${projectLabel(g.project)}${teamOf(g.project) ? ' · team' : ''}`}
              </Heading>
              <View style={[styles.card, { backgroundColor: t.cell }]}>
                {g.hits.map((hit, i) => (
                  <Animated.View key={hit.path} entering={FADE_IN} exiting={FADE_OUT}>
                    {i > 0 && <View style={[styles.separator, { backgroundColor: t.hairline }]} />}
                    <ResultRow hit={hit} t={t} onPress={() => open(hit)} />
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          ))}

          {data.truncated && (
            <Text style={[styles.footnote, { color: t.textMuted }]}>Indicizzazione in corso: cerca di nuovo per i risultati completi.</Text>
          )}
        </>
      )}
    </View>
  );
}

function ResultRow({ hit, t, onPress }: { hit: SearchHit; t: Theme; onPress: () => void }) {
  const icon = hitIcon(hit, t);
  const folder = folderTrail(hit.path);
  return (
    <PressScale onPress={onPress} style={[styles.row, !visibleSnippet(hit) && { alignItems: 'center' }]} accessibilityLabel={`Apri ${hit.name}`}>
      <View style={[styles.well, { backgroundColor: icon.well }]}>
        <Icon name={icon.name} size={16} color={icon.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.mono, fontSize: 14, fontWeight: '500', color: t.text }}>
            {noteTitle(hit.name)}
          </Text>
          {!!folder && (
            <Text numberOfLines={1} style={{ flexShrink: 2, fontSize: 11.5, color: t.textMuted }}>
              {folder}
            </Text>
          )}
        </View>
        <Snippet hit={hit} t={t} />
      </View>
      {hit.extraMatches > 0 && (
        <View style={[styles.badge, { backgroundColor: t.fill }]} accessibilityLabel={`${hit.extraMatches} altre occorrenze`}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.textSecondary, fontVariant: ['tabular-nums'] }}>+{hit.extraMatches}</Text>
        </View>
      )}
    </PressScale>
  );
}

/** A project filter: the selected one fills with the accent colour. */
function FilterChip({ label, count, active, team, onPress }: { label: string; count: number; active: boolean; team?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Animated.View entering={FADE_IN}>
      <PressScale
        onPress={onPress}
        style={[styles.chip, active ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.cell, borderColor: t.hairline }]}
        accessibilityLabel={`${label}, ${count}`}>
        {team && <Icon name="team" size={13} color={active ? '#fff' : t.textMuted} />}
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: active ? '#fff' : t.text }}>{label}</Text>
        <View style={[styles.count, { backgroundColor: active ? 'rgba(255,255,255,0.22)' : t.fill }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : t.textSecondary, fontVariant: ['tabular-nums'] }}>{count}</Text>
        </View>
      </PressScale>
    </Animated.View>
  );
}

/** A small breathing dot while a newer answer is on its way. */
function Status({ loading, t }: { loading: boolean; t: Theme }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(loading ? withRepeat(withTiming(0.25, { duration: 520 }), -1, true) : withTiming(0, { duration: 200 }));
  }, [loading, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return <Animated.View style={[styles.dot, { backgroundColor: t.accent }, style]} />;
}

/** Placeholder rows that shimmer until the first answer arrives. */
function Skeleton() {
  const t = useTheme();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <Animated.View entering={FADE_IN} exiting={FADE_OUT} style={{ marginTop: 22 }}>
      <View style={[styles.card, { backgroundColor: t.cell }]}>
        {[0.62, 0.48, 0.7].map((w, i) => (
          <Animated.View key={i} style={[styles.row, style]}>
            <View style={[styles.well, { backgroundColor: t.fill }]} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[styles.bar, { width: `${w * 60}%`, backgroundColor: t.fill }]} />
              <View style={[styles.bar, { width: `${w * 100}%`, backgroundColor: t.fillSubtle }]} />
            </View>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

function EmptyResults({ query, t }: { query: string; t: Theme }) {
  return (
    <Animated.View entering={FADE_IN} style={styles.empty}>
      <Animated.View entering={FADE_IN} style={[styles.emptyIcon, { backgroundColor: t.accentWell }]}>
        <Icon name="search" size={26} color={t.accentText} />
      </Animated.View>
      <Text style={{ fontSize: 17, fontWeight: '600', color: t.text, textAlign: 'center' }}>Nessun risultato per “{query}”</Text>
      <Text style={{ fontSize: 13.5, lineHeight: 19, color: t.textMuted, textAlign: 'center' }}>
        La ricerca trova le parole dall’inizio: prova un termine più corto o un’altra parola.
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8, marginHorizontal: 4 },
  headingText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 12, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingLeft: 13, paddingRight: 5, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden' },
  top: { gap: 12, padding: 16, borderRadius: 20, borderCurve: 'continuous', borderWidth: 1 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  well: { width: 32, height: 32, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  badge: { marginTop: 2, paddingHorizontal: 7, height: 20, borderRadius: 10, justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  bar: { height: 10, borderRadius: 5 },
  footnote: { fontSize: 12.5, marginTop: 10, marginHorizontal: 4 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 56, paddingHorizontal: 28 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
