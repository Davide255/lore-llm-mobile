import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { NewFileTemplate } from '@/api';
import { folderLabel, pickedFolder } from '@/components/folder-picker';
import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { Banner, Cell, IconWell, Section, SectionHeader } from '@/components/ui';
import { actions, attempt } from '@/data/hooks';
import { firstHeading } from '@/lib/markdown';
import { isProjectRoot, nameFromTitle, projectOf, validateName } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { fonts, useTheme } from '@/theme';

const templates: { key: NewFileTemplate; title: string; subtitle?: string }[] = [
  { key: 'empty', title: 'File vuoto' },
  { key: 'sections', title: 'Titolo + sezioni', subtitle: 'H1, contesto, decisioni' },
  { key: 'checklist', title: 'Checklist', subtitle: 'Elenco di caselle' },
];

/** The template's H1: the name as typed (a slug-style name reads as words). */
function titleFromName(name: string) {
  const s = (/\s/.test(name) ? name : name.replace(/-/g, ' ')).trim();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Senza titolo';
}

function templateContent(template: NewFileTemplate, name: string) {
  const title = titleFromName(name);
  if (template === 'sections') return `# ${title}\n\n## Contesto\n\n\n## Decisioni\n\n`;
  if (template === 'checklist') return `# ${title}\n\n- [ ] \n`;
  return '';
}

/** C2 — New file / folder / paste markdown (entry point is the + menu, C1). */
export default function NewFileScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ parent: string; kind?: 'file' | 'folder' | 'paste' }>();
  const kind = params.kind ?? 'file';
  const isFolder = kind === 'folder';
  // The folder picked in «Posizione» (pushed inside this modal), else where the + menu was opened.
  const picked = pickedFolder.useValue();
  const parent = picked && projectOf(picked) === projectOf(params.parent) ? picked : params.parent;
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<NewFileTemplate>('empty');
  const [pasted, setPasted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A pick belongs to this modal only: forget it when the modal closes.
  useEffect(() => () => pickedFolder.set(null), []);

  useEffect(() => {
    if (kind !== 'paste') return;
    Clipboard.getStringAsync().then((text) => {
      setPasted(text);
      const h1 = firstHeading(text);
      if (h1) setName(nameFromTitle(h1));
    });
  }, [kind]);

  // Dots and spaces are allowed; a typed ".md" is not doubled by the one added on save.
  const clean = isFolder ? name.trim() : name.trim().replace(/\.md$/i, '').trim();
  const error = name ? (validateName(clean) ?? (isFolder && /\.md$/i.test(clean) ? 'Una cartella non può finire con .md' : null)) : null;
  const canCreate = !!clean && !error && !busy && (kind !== 'paste' || !!pasted);

  const create = async () => {
    setBusy(true);
    if (isFolder) {
      const path = await attempt(() => actions.createFolder(parent, clean), 'Impossibile creare la cartella');
      setBusy(false);
      if (path) {
        router.back();
        router.push(routes.folder(path));
      }
      return;
    }
    const content = kind === 'paste' ? (pasted ?? '') : templateContent(template, clean);
    const doc = await attempt(() => actions.createFile({ parent, name: `${clean}.md`, content }), 'Impossibile creare il file');
    setBusy(false);
    if (doc) router.replace(kind === 'paste' ? routes.file(doc.path) : routes.edit(doc.path));
  };

  const pickLocation = () => router.push(routes.newFileFolder(projectOf(parent), parent));

  return (
    <>
      <Stack.Screen options={{ title: isFolder ? 'Nuova cartella' : kind === 'paste' ? 'Incolla markdown' : 'Nuovo file' }} />
      <HeaderItems
        left={[{ kind: 'button', label: 'Annulla', onPress: () => router.back() }]}
        right={[{ kind: 'button', label: 'Crea', variant: 'prominent', disabled: !canCreate, onPress: create }]}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.background }}
        contentContainerStyle={{ padding: 16, paddingTop: 12 }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        <SectionHeader style={{ marginTop: 4 }}>{isFolder ? 'Nome cartella' : 'Nome file'}</SectionHeader>
        <View style={[styles.field, { backgroundColor: t.cell }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={isFolder ? 'Decisioni' : '8. Equilibrio chimico'}
            placeholderTextColor={t.textMuted}
            autoFocus={kind !== 'paste'}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => canCreate && create()}
            selectionColor={t.accentText}
            style={[styles.input, { color: t.text }]}
          />
          {!isFolder && <Text style={{ fontFamily: fonts.mono, fontSize: 15, color: t.textMuted }}>.md</Text>}
        </View>
        <Text style={[styles.hint, { color: error ? t.error : t.textMuted }]}>{error ?? 'Spazi e punti ammessi. Niente barre né : * ? " < > |'}</Text>

        <Section header="Posizione">
          <Cell
            icon={<IconWell name="folderFill" color={t.folder} filled />}
            title={folderLabel(parent)}
            mono
            subtitle={isProjectRoot(parent) ? 'Radice del progetto' : 'Cartella'}
            chevron
            onPress={pickLocation}
          />
        </Section>

        {kind === 'file' && (
          <Section header="Contenuto iniziale" inset={13}>
            {templates.map((tpl) => (
              <Cell
                key={tpl.key}
                title={tpl.title}
                subtitle={tpl.subtitle}
                onPress={() => setTemplate(tpl.key)}
                right={template === tpl.key ? <Icon name="check" size={17} weight="semibold" color={t.accentText} /> : undefined}
              />
            ))}
          </Section>
        )}

        {kind === 'paste' && (
          <>
            <SectionHeader>Dagli appunti</SectionHeader>
            <View style={[styles.preview, { backgroundColor: t.cell }]}>
              <Text numberOfLines={10} style={{ fontFamily: fonts.mono, fontSize: 11.5, lineHeight: 19, color: t.textSecondary }}>
                {pasted === null ? 'Lettura degli appunti…' : pasted || 'Gli appunti sono vuoti.'}
              </Text>
            </View>
          </>
        )}

        {!isFolder && (
          <Banner icon="index" style={{ marginTop: 18 }}>
            index.md verrà rigenerato dopo la creazione.
          </Banner>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12 },
  input: { flex: 1, fontFamily: fonts.mono, fontSize: 15, padding: 0 },
  hint: { fontSize: 11.5, marginTop: 7, marginHorizontal: 6 },
  preview: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
