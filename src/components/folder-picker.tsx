import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { Cell, EmptyState, HeaderTitle, IconWell, Loading, Screen, Section } from '@/components/ui';
import { useFolderTree } from '@/data/hooks';
import { createSignal } from '@/data/store';
import { haptic } from '@/lib/haptics';
import { basename, dirname, projectLabel, projectOf, splitPath } from '@/lib/paths';
import { useTheme } from '@/theme';

/** The folder chosen in the picker, read by the screen that opened it; null: nothing chosen yet. */
export const pickedFolder = createSignal<string | null>(null);

/** `Progetto/a/b/`, with the team id left out of a team project's key. */
export function folderLabel(path: string): string {
  return [projectLabel(path), ...splitPath(path).slice(1)].join('/') + '/';
}

/**
 * The «Posizione» picker, browsed folder by folder like the study mode's note
 * picker: `dir` is the folder shown, opening a subfolder pushes this same screen
 * (back/swipe climbs up) and «Scegli» picks the folder shown. The filter searches
 * the whole subtree; tapping a result picks it. `current` is the folder picked so
 * far, marked along its path. `href` builds the route of a subfolder's screen.
 */
export function FolderPicker({ dir, current, href }: { dir: string; current: string; href: (dir: string) => Parameters<typeof router.push>[0] }) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const tree = useFolderTree(projectOf(dir));

  const isRoot = splitPath(dir).length === 1;
  const name = isRoot ? projectLabel(dir) : basename(dir);
  const all = (tree.data ?? []).filter((f) => f.startsWith(`${dir}/`));
  const q = query.trim().toLowerCase();
  const searching = !!q;

  const childrenOf = (p: string) => all.filter((f) => dirname(f) === p);
  const subfolders = childrenOf(dir).sort((a, b) => basename(a).localeCompare(basename(b), undefined, { numeric: true }));
  const results = searching ? all.filter((f) => basename(f).toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];

  /** Pick `folder` and close the picker: one screen per level below the project, plus the root. */
  const choose = (folder: string) => {
    haptic.select();
    pickedFolder.set(folder);
    router.dismiss(splitPath(dir).length);
  };

  const status = (f: string) => (f === current ? 'Posizione attuale' : current.startsWith(`${f}/`) ? 'Contiene la posizione attuale' : null);

  return (
    <>
      <Stack.Screen options={{ headerTitle: () => <HeaderTitle title={name} subtitle="Posizione" mono={false} /> }} />
      <HeaderItems right={[{ kind: 'button', label: 'Scegli', variant: 'prominent', onPress: () => choose(dir) }]} />
      <Screen keyboardShouldPersistTaps="handled">
        <Text numberOfLines={1} style={[styles.crumbs, { color: t.textMuted }]}>
          {[projectLabel(dir), ...splitPath(dir).slice(1)].join('  ›  ')}
        </Text>

        <Section style={{ marginTop: 10 }}>
          <Cell
            icon={<IconWell name="folderFill" color={t.folder} filled />}
            title={isRoot ? 'Radice del progetto' : `In ${name}/`}
            subtitle={dir === current ? 'Posizione attuale' : 'Crea qui'}
            onPress={() => choose(dir)}
            right={dir === current ? <Icon name="checkCircle" size={22} color={t.accentText} /> : undefined}
          />
        </Section>

        <View style={[styles.search, { backgroundColor: t.fill }]}>
          <Icon name="search" size={16} color={t.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={isRoot ? 'Filtra cartelle' : `Filtra in ${name}`}
            placeholderTextColor={t.textMuted}
            selectionColor={t.accentText}
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, color: t.text, fontSize: 15.5, paddingVertical: 8 }}
          />
        </View>

        {tree.loading && !tree.data ? (
          <Loading />
        ) : searching ? (
          results.length ? (
            <Section style={{ marginTop: 16 }}>
              {results.map((f) => {
                const where = dirname(f).slice(dir.length + 1);
                return (
                  <Cell
                    key={f}
                    icon={<IconWell name="folder" />}
                    title={basename(f)}
                    subtitle={[where || name, status(f)].filter(Boolean).join(' · ')}
                    onPress={() => choose(f)}
                    right={f === current ? <Icon name="checkCircle" size={22} color={t.accentText} /> : undefined}
                  />
                );
              })}
            </Section>
          ) : (
            <EmptyState icon="folder" title="Nessuna cartella" message="Nessuna cartella corrisponde al filtro." />
          )
        ) : subfolders.length ? (
          <Section style={{ marginTop: 16 }}>
            {subfolders.map((f) => {
              const n = childrenOf(f).length;
              const s = status(f);
              return (
                <Cell
                  key={f}
                  icon={<IconWell name="folder" />}
                  title={basename(f)}
                  subtitle={
                    <Text style={{ color: t.textMuted }}>
                      {n === 0 ? 'Nessuna sottocartella' : n === 1 ? '1 sottocartella' : `${n} sottocartelle`}
                      {s ? <Text style={{ color: t.accentText }}>{` · ${s}`}</Text> : null}
                    </Text>
                  }
                  chevron
                  onPress={() => {
                    haptic.light();
                    router.push(href(f));
                  }}
                />
              );
            })}
          </Section>
        ) : (
          <EmptyState icon="folder" title="Nessuna sottocartella" message={`Tocca «Scegli» per creare in ${name}/.`} />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  crumbs: { fontSize: 12.5, marginTop: 8, marginHorizontal: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, paddingHorizontal: 10, marginTop: 18 },
});
