import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { sourceIcon } from '@/components/study/parts';
import { SetupTitle } from '@/components/study/setup-header';
import { Banner, Cell, EmptyState, IconWell, Loading, Pill, Screen, Section } from '@/components/ui';
import { useProjectFiles, useProjects } from '@/data/hooks';
import { studyDraft } from '@/data/study';
import { basename, dirname, projectLabel, projectOf } from '@/lib/paths';
import { haptic } from '@/lib/haptics';
import { routes } from '@/lib/routes';
import { MAX_SOURCES, stepError, studyKind } from '@/lib/study-model';
import { useTheme } from '@/theme';

type Kind = 'markdown' | 'pdf' | 'image';
const KIND_LABELS: Record<Kind, string> = { markdown: 'Markdown', pdf: 'PDF', image: 'Foto' };

interface Folder {
  path: string;
  name: string;
  count: number;
  picked: number;
}

/**
 * A2 — Step 1 of 3: which notes, browsed folder by folder. `dir` is the folder
 * shown (null: the root of the draft's project); opening a subfolder pushes this
 * same screen, so back/swipe climbs up. Markdown, PDFs and photos in one list;
 * the filter searches the whole subtree. Switching project keeps what was picked
 * elsewhere, so a session can mix notes of several projects. The report goes to
 * the project chosen at the root.
 */
export function NotePicker({ dir }: { dir: string | null }) {
  const t = useTheme();
  const draft = studyDraft.useValue();
  const projects = useProjects();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const project = dir ? projectOf(dir) : (draft?.project ?? null);
  const here = dir ?? project;
  const files = useProjectFiles(project);

  if (!draft) return <EmptyState icon="school" title="Nessuna sessione da preparare" />;

  const isRoot = !dir;
  const dirName = dir ? basename(dir) : '';
  const notes = (files.data ?? []).filter((p) => studyKind(p) !== null && here && p.startsWith(`${here}/`));
  const matching = notes.filter((p) => !kind || studyKind(p) === kind);
  const q = query.trim().toLowerCase();
  const searching = !!q;
  const selected = new Set(draft.sources);

  // Direct children of `here`: subfolders (with how many matching notes they hold) and files.
  const folders = new Map<string, Folder>();
  const direct: string[] = [];
  for (const p of matching) {
    const rest = p.slice(here!.length + 1);
    const slash = rest.indexOf('/');
    if (slash < 0) {
      direct.push(p);
      continue;
    }
    const name = rest.slice(0, slash);
    const f = folders.get(name) ?? { path: `${here}/${name}`, name, count: 0, picked: 0 };
    f.count++;
    if (selected.has(p)) f.picked++;
    folders.set(name, f);
  }
  const subfolders = [...folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const shownFiles = searching ? matching.filter((p) => basename(p).toLowerCase().includes(q)) : direct;

  const elsewhere = draft.sources.filter((p) => !p.startsWith(`${draft.project}/`)).length;
  const error = stepError(draft, 'sources');
  const allPicked = shownFiles.length > 0 && shownFiles.every((p) => selected.has(p));

  const toggle = (path: string) => {
    // Picking a note past the limit answers with a bump instead of a tick.
    if (!selected.has(path) && draft.sources.length >= MAX_SOURCES) haptic.warn();
    else haptic.select();
    const next = selected.has(path) ? draft.sources.filter((p) => p !== path) : [...draft.sources, path];
    studyDraft.set({ ...draft, sources: next });
  };

  const toggleAll = () => {
    haptic.light();
    const shown = new Set(shownFiles);
    const next = allPicked
      ? draft.sources.filter((p) => !shown.has(p))
      : [...draft.sources, ...shownFiles.filter((p) => !selected.has(p))];
    studyDraft.set({ ...draft, sources: next });
  };

  const pickProject = () =>
    showActionSheet({
      title: 'Progetto',
      options: (projects.data ?? []).map((p) => ({ label: p.title, onPress: () => studyDraft.set({ ...draft, project: p.name }) })),
    });

  /** Folder of `p` relative to the folder shown, for search results. */
  const relFolder = (p: string) => dirname(p).slice(here!.length + 1);

  return (
    <>
      <SetupTitle step={1} title={isRoot ? undefined : dirName} />
      <HeaderItems
        left={isRoot ? [{ kind: 'button', label: 'Annulla', onPress: () => router.back() }] : undefined}
        right={[{ kind: 'button', label: 'Avanti', variant: 'prominent', disabled: !!error, onPress: () => router.push(routes.studySetup('types')) }]}
      />
      <Screen keyboardShouldPersistTaps="handled">
        {isRoot ? (
          <Section inset={13} style={{ marginTop: 8 }}>
            <Cell
              icon={<IconWell name="folder" />}
              title={project ? projectLabel(project) : 'Scegli un progetto'}
              subtitle="Il report sarà salvato in studio/ di questo progetto"
              chevron
              onPress={pickProject}
            />
          </Section>
        ) : (
          <Text numberOfLines={1} style={[styles.crumbs, { color: t.textMuted }]}>
            {[projectLabel(dir ?? ''), ...(dir ?? '').split('/').slice(1)].join('  ›  ')}
          </Text>
        )}

        <View style={[styles.search, { backgroundColor: t.fill }]}>
          <Icon name="search" size={16} color={t.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={isRoot ? 'Filtra appunti' : `Filtra in ${dirName}`}
            placeholderTextColor={t.textMuted}
            selectionColor={t.accentText}
            clearButtonMode="while-editing"
            style={{ flex: 1, color: t.text, fontSize: 15.5, paddingVertical: 8 }}
          />
        </View>
        <View style={styles.filters}>
          <Pill size="md" active={!kind} onPress={() => {
            haptic.select();
            setKind(null);
          }}>{`Tutti · ${notes.length}`}</Pill>
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <Pill key={k} size="md" active={kind === k} onPress={() => {
              haptic.select();
              setKind(kind === k ? null : k);
            }}>
              {KIND_LABELS[k]}
            </Pill>
          ))}
        </View>

        <View style={styles.countRow}>
          <Text style={[styles.count, { color: draft.sources.length > MAX_SOURCES ? t.errorText : t.textSecondary }]}>
            {draft.sources.length ? `${draft.sources.length} selezionati${elsewhere ? ` (${elsewhere} da altri progetti)` : ''}` : 'Nessun appunto selezionato'}
            {draft.sources.length > MAX_SOURCES ? ` · al massimo ${MAX_SOURCES}` : ''}
          </Text>
          {shownFiles.length > 1 ? (
            <Pressable onPress={toggleAll} hitSlop={8}>
              <Text style={[styles.selectAll, { color: t.accentText }]}>{allPicked ? 'Deseleziona tutti' : 'Seleziona tutti'}</Text>
            </Pressable>
          ) : null}
        </View>

        {files.loading && !files.data ? (
          <Loading />
        ) : (searching ? shownFiles.length : subfolders.length + shownFiles.length) ? (
          <>
            {!searching && subfolders.length ? (
              <Section style={{ marginBottom: shownFiles.length ? 16 : 0 }}>
                {subfolders.map((f) => (
                  <Cell
                    key={f.path}
                    icon={<IconWell name="folder" />}
                    title={f.name}
                    subtitle={
                      <Text style={{ color: t.textMuted }}>
                        {f.count === 1 ? '1 appunto' : `${f.count} appunti`}
                        {f.picked ? <Text style={{ color: t.accentText }}>{` · ${f.picked} selezionati`}</Text> : null}
                      </Text>
                    }
                    chevron
                    onPress={() => {
                      haptic.light();
                      router.push(routes.studySetupFolder(f.path));
                    }}
                  />
                ))}
              </Section>
            ) : null}
            {shownFiles.length ? (
              <Section>
                {shownFiles.map((p) => {
                  const on = selected.has(p);
                  const folder = searching ? relFolder(p) : '';
                  return (
                    <Cell
                      key={p}
                      icon={<IconWell name={sourceIcon(p)} />}
                      title={basename(p)}
                      subtitle={`${KIND_LABELS[studyKind(p)!]}${folder ? ` · ${folder}` : ''}`}
                      onPress={() => toggle(p)}
                      right={<Icon name={on ? 'checkCircle' : 'circle'} size={22} color={on ? t.accentText : t.textMuted} />}
                    />
                  );
                })}
              </Section>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="doc"
            title="Nessun appunto"
            message={notes.length ? 'Nessun file corrisponde al filtro.' : isRoot ? 'Questo progetto non ha note, PDF o foto.' : 'Questa cartella non ha note, PDF o foto.'}
          />
        )}

        {isRoot ? (
          <Banner icon="scan" style={{ marginTop: 16 }}>
            PDF e foto li legge direttamente l’AI: anche le formule scritte a mano contano come testo.
          </Banner>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  crumbs: { fontSize: 12.5, marginTop: 8, marginHorizontal: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, paddingHorizontal: 10, marginTop: 18 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, marginBottom: 8, marginHorizontal: 6 },
  count: { flex: 1, fontSize: 12.5 },
  selectAll: { fontSize: 12.5, fontWeight: '600' },
});
