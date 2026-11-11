import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Project, SearchHit } from '@/api';
import { Icon } from '@/components/icon';
import { Cell, EmptyState, Pill, Section, SectionHeader } from '@/components/ui';
import { actions, useRecentSearches, useSearch, useStars } from '@/data/hooks';
import { plural } from '@/lib/format';
import { projectLabel, teamOf } from '@/lib/paths';
import { routes } from '@/lib/routes';
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

/** Recent searches, shown while the search bar is focused and empty. */
export function RecentSearches({ onPick }: { onPick: (q: string) => void }) {
  const t = useTheme();
  const recent = useRecentSearches();
  return (
    <Section header="Ricerche recenti">
      {(recent.data ?? []).map((q) => (
        <Cell
          key={q}
          icon={<Icon name="history" size={19} color={t.accentText} style={{ marginHorizontal: 6 }} />}
          title={q}
          onPress={() => onPick(q)}
          right={
            <Pressable hitSlop={10} onPress={() => actions.removeRecentSearch(q)} accessibilityLabel={`Rimuovi ${q}`}>
              <Icon name="close" size={14} color={t.textMuted} />
            </Pressable>
          }
        />
      ))}
    </Section>
  );
}

/**
 * Global search results (D2): projects whose name matches, then a full-text search
 * over every note the user can read, filterable by project.
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
  const results = useSearch(query, project);
  const stars = useStars();
  const starredPaths = new Set((stars.data ?? []).map((s) => s.path));
  const isStarred = (name: string) => starredPaths.has(name);

  const q = query.toLowerCase();
  const matchingProjects = project ? [] : starredFirst(projects.filter((p) => p.title.toLowerCase().includes(q)), (p) => isStarred(p.name));

  // A team's project may share its name with a personal one: mark it.
  const pillLabel = (key: string) => `${projectLabel(key)}${teamOf(key) ? ' · team' : ''}`;
  const counts = new Map(results.data?.byProject.map((b) => [b.project, b.matches]));
  const total = results.data?.byProject.reduce((n, b) => n + b.matches, 0) ?? 0;

  const openHit = (hit: SearchHit) => {
    actions.addRecentSearch(query);
    router.push(routes.file(hit.path));
  };

  const noHits = results.data && results.data.hits.length === 0;

  return (
    <>
      {matchingProjects.length > 0 && <Section header={plural(matchingProjects.length, 'progetto', 'progetti')}>{matchingProjects.map(renderProject)}</Section>}

      {counts.size > 0 || project ? (
        <>
          <SectionHeader>Note</SectionHeader>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} style={{ marginHorizontal: -16, marginBottom: 4 }}>
            <View style={{ width: 14 }} />
            <Pill size="md" active={!project} onPress={() => setProject(null)}>
              {project ? 'Tutti' : `Tutti · ${total}`}
            </Pill>
            {starredFirst(project && !counts.has(project) ? [project, ...counts.keys()] : [...counts.keys()], isStarred).map((p) => (
              <Pill key={p} size="md" active={project === p} onPress={() => setProject(project === p ? null : p)}>
                {counts.has(p) ? `${pillLabel(p)} · ${counts.get(p)}` : pillLabel(p)}
              </Pill>
            ))}
            <View style={{ width: 14 }} />
          </ScrollView>
        </>
      ) : null}

      {noHits && matchingProjects.length === 0 ? (
        <EmptyState icon="search" title="Nessun risultato" message={`Niente per “${query}”${project ? ` in ${projectLabel(project)}` : ''}.`} />
      ) : results.data && results.data.hits.length > 0 ? (
        <Section
          header={`${plural(results.data.totalMatches, 'risultato', 'risultati')} in ${plural(results.data.hits.length, 'file', 'file')}`}
          footer={results.data.truncated ? 'Indicizzazione in corso: cerca di nuovo per i risultati completi.' : undefined}
          inset={13}>
          {starredFirst(results.data.hits, (h) => isStarred(h.path) || isStarred(h.project)).map((hit) => (
            <ResultRow key={hit.path} hit={hit} t={t} onPress={() => openHit(hit)} />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function ResultRow({ hit, t, onPress }: { hit: SearchHit; t: Theme; onPress: () => void }) {
  const { text, highlights } = hit.snippet;
  const parts: ReactNode[] = [];
  let cursor = 0;
  highlights.forEach(([s, e], i) => {
    if (s > cursor) parts.push(text.slice(cursor, s));
    parts.push(
      <Text key={i} style={{ backgroundColor: t.highlight, color: t.text }}>
        {text.slice(s, e)}
      </Text>,
    );
    cursor = e;
  });
  parts.push(text.slice(cursor));

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.result, pressed && { backgroundColor: t.fill }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Icon name={hit.role === 'index' ? 'index' : 'doc'} size={16} color={hit.role === 'index' ? t.info : t.textMuted} />
        <Text style={{ fontFamily: fonts.mono, fontSize: 13.5, fontWeight: '500', color: t.text }}>{hit.name}</Text>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: t.textMuted }}>
          · {projectLabel(hit.project)}
        </Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 19.5, color: t.textSecondary }}>{parts}</Text>
      {hit.extraMatches > 0 && (
        <Text style={{ fontSize: 11, color: t.textMuted }}>
          +{hit.extraMatches} {hit.extraMatches === 1 ? 'altra occorrenza' : 'altre occorrenze'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, paddingHorizontal: 2 },
  result: { gap: 6, paddingHorizontal: 13, paddingVertical: 12 },
});
