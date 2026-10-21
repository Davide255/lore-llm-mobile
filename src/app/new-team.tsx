import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { SectionHeader } from '@/components/ui';
import { actions, attempt, useTeam } from '@/data/hooks';
import { routes } from '@/lib/routes';
import { useTheme } from '@/theme';

/** Create a team, or (with `id`) rename one. The creator becomes its owner. */
export default function NewTeamScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useTeam(id ?? '').data;
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = typed ?? existing?.name ?? '';
  const valid = name.trim().length > 0 && name.trim().length <= 64;

  const save = async () => {
    setBusy(true);
    if (id) {
      const ok = await attempt(() => actions.renameTeam(id, name.trim()).then(() => true), 'Impossibile rinominare il team');
      setBusy(false);
      if (ok) router.back();
      return;
    }
    const team = await attempt(() => actions.createTeam(name.trim()), 'Impossibile creare il team');
    setBusy(false);
    if (team) {
      router.back();
      router.push(routes.team(team.id));
    }
  };

  return (
    <>
      <HeaderItems
        left={[{ kind: 'button', label: 'Annulla', onPress: () => router.back() }]}
        right={[{ kind: 'button', label: id ? 'Salva' : 'Crea', variant: 'prominent', disabled: !valid || busy, onPress: save }]}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.background }}
        contentContainerStyle={{ padding: 16, paddingTop: 12 }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        <SectionHeader style={{ marginTop: 0 }}>Nome del team</SectionHeader>
        <TextInput
          value={name}
          onChangeText={setTyped}
          placeholder="es. Marketing"
          placeholderTextColor={t.textMuted}
          autoFocus
          maxLength={64}
          returnKeyType="done"
          onSubmitEditing={valid && !busy ? save : undefined}
          selectionColor={t.accentText}
          style={[styles.field, { backgroundColor: t.cell, color: t.text }]}
        />
        {!id && (
          <Text style={[styles.hint, { color: t.textMuted }]}>
            Potrai invitare persone via email e condividere progetti con tutto il team. Ne sarai il proprietario.
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  field: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 16 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 7, marginHorizontal: 6 },
});
