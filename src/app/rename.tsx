import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { SectionHeader } from '@/components/ui';
import { actions, attempt } from '@/data/hooks';
import { basename, isProjectRoot, projectLabel, validateSlug } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { cleanName, isAttachment } from '@/lib/upload-plan';
import { fonts, useTheme } from '@/theme';

/** Rename a file, folder or project. Files keep their .md extension. */
export default function RenameScreen() {
  const t = useTheme();
  const { path, reopen } = useLocalSearchParams<{ path: string; reopen?: string }>();
  const isProject = isProjectRoot(path);
  // A team project's key carries its team: only the name before it is edited.
  const current = isProject ? projectLabel(path) : basename(path);
  // An uploaded PDF or image keeps its extension; only the part before it is edited.
  const attachment = !isProject && isAttachment(current);
  const ext = attachment ? current.slice(current.lastIndexOf('.')) : current.endsWith('.md') ? '.md' : '';
  const isFile = !!ext;
  const [name, setName] = useState(isFile ? current.slice(0, -ext.length) : current);
  const [busy, setBusy] = useState(false);

  // Projects and attachments are free-form names; notes and folders follow the slug rule.
  const free = isProject || attachment;
  const error = isProject
    ? name.trim() && !name.includes('/') && !name.includes('@')
      ? null
      : 'Nome non valido.'
    : attachment
      ? name.trim() && cleanName(name) === name.trim()
        ? null
        : 'Nome non valido: niente barre, due punti o caratteri speciali.'
      : validateSlug(name);
  const next = isFile ? `${attachment ? name.trim() : name}${ext}` : name.trim();
  const canSave = !error && next !== current && !busy;

  const save = async () => {
    setBusy(true);
    const target = await attempt(() => actions.rename(path, next), 'Impossibile rinominare');
    setBusy(false);
    if (!target) return;
    router.back();
    if (reopen) router.replace(isFile ? routes.file(target) : routes.folder(target));
  };

  return (
    <>
      <HeaderItems
        left={[{ kind: 'button', label: 'Annulla', onPress: () => router.back() }]}
        right={[{ kind: 'button', label: 'Salva', variant: 'prominent', disabled: !canSave, onPress: save }]}
      />
      <ScrollView style={{ flex: 1, backgroundColor: t.background }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <SectionHeader style={{ marginTop: 4 }}>{isProject ? 'Nome progetto' : 'Nuovo nome'}</SectionHeader>
        <View style={[styles.field, { backgroundColor: t.cell }]}>
          <TextInput
            value={name}
            onChangeText={(v) => setName(free ? v : v.toLowerCase().replace(/\s+/g, '-'))}
            autoFocus
            selectTextOnFocus
            autoCapitalize={free ? 'sentences' : 'none'}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => canSave && save()}
            selectionColor={t.accentText}
            style={[styles.input, { color: t.text, fontFamily: free ? undefined : fonts.mono }]}
          />
          {isFile && <Text style={{ fontFamily: fonts.mono, fontSize: 15, color: t.textMuted }}>{ext}</Text>}
        </View>
        <Text style={{ fontSize: 11.5, marginTop: 7, marginHorizontal: 6, color: error && name ? t.error : t.textMuted }}>
          {error && name
            ? error
            : isProject
              ? 'I link degli agenti verso questo progetto verranno aggiornati.'
              : attachment
                ? `L'estensione ${ext} resta invariata. I link che puntano al file non vengono aggiornati.`
                : 'Minuscole e trattini. Niente spazi.'}
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12 },
  input: { flex: 1, fontSize: 15, padding: 0 },
});
