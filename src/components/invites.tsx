import { useState } from 'react';
import { View } from 'react-native';

import { showToast } from '@/components/toast';
import { Cell, IconWell, Pill, Section } from '@/components/ui';
import { actions, attempt, useMyInvites } from '@/data/hooks';
import { expiresIn } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/teams';

/** Invitations to join a team, addressed to the signed-in user's email. Renders nothing when there are none. */
export function PendingInvites() {
  const invites = useMyInvites();
  const [busy, setBusy] = useState<string | null>(null);
  if (!invites.data?.length) return null;

  const answer = async (id: string, teamName: string, accept: boolean) => {
    setBusy(id);
    const ok = await attempt(() => actions.answerInvite(id, accept).then(() => true), accept ? 'Impossibile accettare l’invito' : 'Impossibile rifiutare l’invito');
    setBusy(null);
    if (ok && accept) showToast({ icon: 'team', subject: teamName, message: 'ora fai parte del team' });
  };

  return (
    <Section header={invites.data.length === 1 ? 'Invito' : `Inviti · ${invites.data.length}`}>
      {invites.data.map((i) => (
        <Cell
          key={i.id}
          alignTop
          icon={<IconWell name="mail" />}
          title={`Entra in ${i.teamName}`}
          subtitle={`${i.invitedBy ?? 'Qualcuno'} ti invita come ${ROLE_LABEL[i.role].toLowerCase()} · ${expiresIn(i.expiresAt)}`}>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, opacity: busy === i.id ? 0.5 : 1 }} pointerEvents={busy === i.id ? 'none' : 'auto'}>
            <Pill active size="md" onPress={() => answer(i.id, i.teamName, true)}>
              Accetta
            </Pill>
            <Pill size="md" onPress={() => answer(i.id, i.teamName, false)}>
              Rifiuta
            </Pill>
          </View>
        </Cell>
      ))}
    </Section>
  );
}
