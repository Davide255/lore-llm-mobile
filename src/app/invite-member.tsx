import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import type { InviteRole } from '@/api';
import { HeaderItems } from '@/components/header-items';
import { SectionHeader } from '@/components/ui';
import { actions, attempt } from '@/data/hooks';
import { INVITE_ROLES, ROLE_HINT, ROLE_LABEL, looksLikeEmail } from '@/lib/teams';
import { useTheme } from '@/theme';

/** Invite someone by email. They see the invitation when they sign in with that email. */
export default function InviteMemberScreen() {
  const t = useTheme();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('editor');
  const [busy, setBusy] = useState(false);
  const valid = looksLikeEmail(email);

  const invite = async () => {
    setBusy(true);
    const sent = await attempt(() => actions.inviteToTeam(teamId, email.trim().toLowerCase(), role), 'Impossibile invitare');
    setBusy(false);
    if (sent) router.back();
  };

  return (
    <>
      <HeaderItems
        left={[{ kind: 'button', label: 'Annulla', onPress: () => router.back() }]}
        right={[{ kind: 'button', label: 'Invita', variant: 'prominent', disabled: !valid || busy, onPress: invite }]}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.background }}
        contentContainerStyle={{ padding: 16, paddingTop: 12 }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        <SectionHeader style={{ marginTop: 0 }}>Email</SectionHeader>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="nome@esempio.com"
          placeholderTextColor={t.textMuted}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="done"
          selectionColor={t.accentText}
          style={[styles.field, { backgroundColor: t.cell, color: t.text }]}
        />
        <Text style={[styles.hint, { color: t.textMuted }]}>
          Deve essere l’email dell’account (Google o Apple) con cui la persona accede a Lore. L’invito scade dopo 14 giorni.
        </Text>

        <SectionHeader>Ruolo</SectionHeader>
        <SegmentedControl
          values={INVITE_ROLES.map((r) => ROLE_LABEL[r])}
          selectedIndex={INVITE_ROLES.indexOf(role)}
          onValueChange={(label) => setRole(INVITE_ROLES.find((r) => ROLE_LABEL[r] === label)!)}
          appearance={t.scheme}
          tintColor={t.accent}
        />
        <Text style={[styles.hint, { color: t.textMuted }]}>{ROLE_HINT[role]}. Potrai cambiarlo in qualsiasi momento.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  field: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 16 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 7, marginHorizontal: 6 },
});
