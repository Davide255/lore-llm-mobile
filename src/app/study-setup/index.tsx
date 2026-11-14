import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { sourceIcon } from '@/components/study/parts';
import { SetupTitle } from '@/components/study/setup-header';
import { Banner, Cell, EmptyState, IconWell, Loading, Pill, Screen, Section } from '@/components/ui';
import { useProjectFiles, useProjects } from '@/data/hooks';
import { studyDraft } from '@/data/study';
import { basename, dirname, projectLabel } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { MAX_SOURCES, stepError, studyKind } from '@/lib/study-model';
import { useTheme } from '@/theme';

type Kind = 'markdown' | 'pdf' | 'image';
const KIND_LABELS: Record<Kind, string> = { markdown: 'Markdown', pdf: 'PDF', image: 'Foto' };

/**
 * A2 — Step 1 of 3: which notes. Markdown, PDFs and photos of the chosen
 * project in one list; switching project keeps what was picked elsewhere, so a
 * session can mix notes of several projects. The report goes to the project
 * shown here.
 */
export default function ChooseNotesScreen() {
  const t = useTheme();
  const draft = studyDraft.useValue();
  const projects = useProjects();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const project = draft?.project ?? null;
  const files = useProjectFiles(project);

  if (!draft) return <EmptyState icon="school" title="Nessuna sessione da preparare" />;

  const notes = (files.data ?? []).filter((p) => studyKind(p) !== null);
  const q = query.trim().toLowerCase();
  const shown = notes.filter((p) => (!kind || studyKind(p) === kind) && (!q || p.toLowerCase().includes(q)));
  const selected = new Set(draft.sources);
  const elsewhere = draft.sources.filter((p) => !p.startsWith(`${project}/`)).length;
  const error = stepError(draft, 'sources');

  const toggle = (path: string) => {
    const next = selected.has(path) ? draft.sources.filter((p) => p !== path) : [...draft.sources, path];
    studyDraft.set({ ...draft, sources: next });
  };

  const pickProject = () =>
    showActionSheet({
      title: 'Progetto',
      options: (projects.data ?? []).map((p) => ({ label: p.title, onPress: () => studyDraft.set({ ...draft, project: p.name }) })),
    });

  return (
    <>
      <SetupTitle step={1} />
      <HeaderItems
        left={[{ kind: 'button', label: 'Annulla', onPress: () => router.back() }]}
        right={[{ kind: 'button', label: 'Avanti', variant: 'prominent', disabled: !!error, onPress: () => router.push(routes.studySetup('types')) }]}
      />
      <Screen keyboardShouldPersistTaps="handled">
        <Section inset={13} style={{ marginTop: 8 }}>
          <Cell
            icon={<IconWell name="folder" />}
            title={project ? projectLabel(project) : 'Scegli un progetto'}
            subtitle="Il report sarà salvato in studio/ di questo progetto"
            chevron
            onPress={pickProject}
          />
        </Section>

        <View style={[styles.search, { backgroundColor: t.fill }]}>
          <Icon name="search" size={16} color={t.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filtra appunti"
            placeholderTextColor={t.textMuted}
            selectionColor={t.accentText}
            style={{ flex: 1, color: t.text, fontSize: 15.5, paddingVertical: 8 }}
          />
        </View>
        <View style={styles.filters}>
          <Pill size="md" active={!kind} onPress={() => setKind(null)}>{`Tutti · ${notes.length}`}</Pill>
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <Pill key={k} size="md" active={kind === k} onPress={() => setKind(kind === k ? null : k)}>
              {KIND_LABELS[k]}
            </Pill>
          ))}
        </View>

        <Text style={[styles.count, { color: draft.sources.length > MAX_SOURCES ? t.errorText : t.textSecondary }]}>
          {draft.sources.length ? `${draft.sources.length} selezionati${elsewhere ? ` (${elsewhere} da altri progetti)` : ''}` : 'Nessun appunto selezionato'}
          {draft.sources.length > MAX_SOURCES ? ` · al massimo ${MAX_SOURCES}` : ''}
        </Text>

        {files.loading && !files.data ? (
          <Loading />
        ) : shown.length ? (
          <Section>
            {shown.map((p) => {
              const on = selected.has(p);
              const k = studyKind(p)!;
              const folder = dirname(p).split('/').slice(1).join('/');
              return (
                <Cell
                  key={p}
                  icon={<IconWell name={sourceIcon(p)} />}
                  title={basename(p)}
                  subtitle={`${KIND_LABELS[k]}${folder ? ` · ${folder}` : ''}`}
                  onPress={() => toggle(p)}
                  right={<Icon name={on ? 'checkCircle' : 'circle'} size={22} color={on ? t.accentText : t.textMuted} />}
                />
              );
            })}
          </Section>
        ) : (
          <EmptyState icon="doc" title="Nessun appunto" message={notes.length ? 'Nessun file corrisponde al filtro.' : 'Questo progetto non ha note, PDF o foto.'} />
        )}

        <Banner icon="scan" style={{ marginTop: 16 }}>
          PDF e foto li legge direttamente l’AI: anche le formule scritte a mano contano come testo.
        </Banner>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, paddingHorizontal: 10, marginTop: 18 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  count: { fontSize: 12.5, marginTop: 16, marginBottom: 8, marginHorizontal: 6 },
});
