import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import type { SearchHit } from '@/api';
import { Icon } from '@/components/icon';
import { Cell, EmptyState, IconWell, Pill, Screen, Section, SectionHeader } from '@/components/ui';
import { actions, useProjects, useRecentFiles, useRecentSearches, useSearch } from '@/data/hooks';
import { plural } from '@/lib/format';
import { projectLabel, teamOf } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { fonts, useTheme, type Theme } from '@/theme';

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** D1 initial state · D2 results. Full-text over the whole base. */
export default function SearchScreen() {
  const t = useTheme();
  const bar = useRef<SearchBarCommands>(null);
  const [text, setText] = useState('');
  const [project, setProject] = useState<string | null>(null);
  const query = useDebounced(text.trim());
  const results = useSearch(query, project);
  const recentSearches = useRecentSearches();
  const recentFiles = useRecentFiles(4);
  const projects = useProjects();

  const runRecent = (q: string) => {
    bar.current?.setText(q);
    setText(q);
  };

  const openHit = (hit: SearchHit) => {
    actions.addRecentSearch(query);
    router.push(routes.file(hit.path));
  };

  const projectNames = (projects.data ?? []).map((p) => p.name);
  // A team's project may share its name with a personal one: mark it.
  const pillLabel = (key: string) => `${projectLabel(key)}${teamOf(key) ? ' · team' : ''}`;
  const counts = new Map(results.data?.byProject.map((b) => [b.project, b.matches]));
  const total = results.data?.byProject.reduce((n, b) => n + b.matches, 0) ?? 0;

  const filterPills = (withCounts: boolean) => (
    <>
      <Pill size="md" active={!project} onPress={() => setProject(null)}>
        {withCounts ? `Tutti · ${total}` : 'Tutti'}
      </Pill>
      {(withCounts ? [...counts.keys()] : projectNames).map((p) => (
        <Pill key={p} size="md" active={project === p} onPress={() => setProject(project === p ? null : p)}>
          {withCounts ? `${pillLabel(p)} · ${counts.get(p)}` : pillLabel(p)}
        </Pill>
      ))}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Cerca' }} />
      <Stack.SearchBar
        ref={bar}
        placeholder="Parola o frase"
        hideWhenScrolling={false}
        cancelButtonText="Annulla"
        onChangeText={(e) => setText(e.nativeEvent.text)}
        onSearchButtonPress={(e) => actions.addRecentSearch(e.nativeEvent.text)}
        onCancelButtonPress={() => setText('')}
      />
      <Screen keyboardShouldPersistTaps="handled">
        {!query ? (
          <>
            <Section header="Ricerche recenti">
              {(recentSearches.data ?? []).map((q) => (
                <Cell
                  key={q}
                  icon={<Icon name="history" size={19} color={t.accentText} style={{ marginHorizontal: 6 }} />}
                  title={q}
                  onPress={() => runRecent(q)}
                  right={
                    <Pressable hitSlop={10} onPress={() => actions.removeRecentSearch(q)} accessibilityLabel={`Rimuovi ${q}`}>
                      <Icon name="close" size={14} color={t.textMuted} />
                    </Pressable>
                  }
                />
              ))}
            </Section>

            {projectNames.length > 0 && (
              <>
                <SectionHeader>Filtra per progetto</SectionHeader>
                <View style={styles.wrap}>{filterPills(false)}</View>
              </>
            )}

            <Section header="Aperti di recente">
              {(recentFiles.data ?? []).map((r) => (
                <Cell
                  key={r.path}
                  icon={<IconWell name={r.role === 'index' ? 'index' : r.role === 'checklist' ? 'checklist' : 'doc'} />}
                  title={r.name}
                  mono
                  subtitle={projectLabel(r.project)}
                  onPress={() => router.push(routes.file(r.path))}
                />
              ))}
            </Section>
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.wrap, { flexWrap: 'nowrap' }]} style={{ marginTop: 6, marginHorizontal: -16 }}>
              <View style={{ width: 14 }} />
              {filterPills(true)}
              <View style={{ width: 14 }} />
            </ScrollView>

            {results.data && results.data.hits.length === 0 ? (
              <EmptyState icon="search" title="Nessun risultato" message={`Niente per “${query}”${project ? ` in ${project}` : ''}.`} />
            ) : results.data ? (
              <Section
                header={`${plural(results.data.totalMatches, 'risultato', 'risultati')} in ${plural(results.data.hits.length, 'file', 'file')}`}
                inset={13}>
                {results.data.hits.map((hit) => (
                  <ResultRow key={hit.path} hit={hit} t={t} onPress={() => openHit(hit)} />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}

function ResultRow({ hit, t, onPress }: { hit: SearchHit; t: Theme; onPress: () => void }) {
  const { text, highlights } = hit.snippet;
  const parts: React.ReactNode[] = [];
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 2 },
  result: { gap: 6, paddingHorizontal: 13, paddingVertical: 12 },
});
