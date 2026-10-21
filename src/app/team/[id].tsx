import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Text } from 'react-native';

import type { TeamMember, TeamRole } from '@/api';
import { showActionSheet } from '@/components/action-sheet';
import { AgentAvatar, initialsOf } from '@/components/identity';
import { Cell, ErrorState, IconWell, Loading, Pill, Screen, Section } from '@/components/ui';
import { actions, attempt, useTeam, useTeamInvites, useTeamMembers } from '@/data/hooks';
import { expiresIn } from '@/lib/format';
import { routes } from '@/lib/routes';
import { ROLE_HINT, ROLE_LABEL, canManage, otherRoles, sortMembers } from '@/lib/teams';
import { useTheme } from '@/theme';

/** Team detail: members and roles, pending invitations, rename, leave or delete. */
export default function TeamScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const team = useTeam(id);
  const members = useTeamMembers(id);
  const owner = !!team.data && canManage(team.data.role);
  const invites = useTeamInvites(owner ? id : null);
  const me = members.data?.find((m) => m.isYou);

  const leave = () =>
    Alert.alert(`Uscire da ${team.data?.name}?`, 'Non vedrai più i suoi file. Potrai rientrare solo con un nuovo invito.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: async () => {
          const ok = await attempt(() => actions.removeMember(id, me!.userId).then(() => true), 'Impossibile uscire dal team');
          if (ok) router.back();
        },
      },
    ]);

  const destroy = () =>
    Alert.alert(`Eliminare ${team.data?.name}?`, 'Il team deve essere vuoto: sposta o elimina prima i suoi file. Membri e inviti vengono rimossi.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          const ok = await attempt(() => actions.deleteTeam(id).then(() => true), 'Impossibile eliminare il team');
          if (ok) router.back();
        },
      },
    ]);

  const manageMember = (m: TeamMember) =>
    showActionSheet({
      title: m.name ?? m.email ?? 'Membro',
      message: `${ROLE_LABEL[m.role]} · ${ROLE_HINT[m.role]}`,
      options: [
        ...otherRoles(m.role).map((role: TeamRole) => ({
          label: `Rendi ${ROLE_LABEL[role].toLowerCase()}`,
          onPress: () => void attempt(() => actions.setMemberRole(id, m.userId, role), 'Impossibile cambiare il ruolo'),
        })),
        {
          label: 'Rimuovi dal team',
          icon: 'delete',
          destructive: true,
          onPress: () => void attempt(() => actions.removeMember(id, m.userId), 'Impossibile rimuovere la persona'),
        },
      ],
    });

  const manageInvite = (inviteId: string, email: string) =>
    showActionSheet({
      title: email,
      options: [
        {
          label: 'Revoca invito',
          icon: 'delete',
          destructive: true,
          onPress: () => void attempt(() => actions.revokeInvite(id, inviteId), 'Impossibile revocare l’invito'),
        },
      ],
    });

  return (
    <>
      <Stack.Screen options={{ title: team.data?.name ?? '' }} />
      {team.loading || members.loading ? (
        <Loading />
      ) : team.error || !team.data ? (
        <ErrorState error={team.error} onRetry={team.refresh} />
      ) : (
        <Screen contentContainerStyle={{ paddingTop: 8 }}>
          <Section>
            <Cell
              icon={<IconWell name="team" />}
              title={team.data.name}
              strong
              subtitle={`Il tuo ruolo: ${ROLE_LABEL[team.data.role].toLowerCase()}`}
              right={owner ? <Text style={{ color: t.accentText, fontSize: 15 }}>Rinomina</Text> : undefined}
              onPress={owner ? () => router.push({ pathname: '/new-team', params: { id } }) : undefined}
            />
          </Section>

          <Section header={`Membri · ${members.data?.length ?? 0}`} footer={owner ? 'Tocca un membro per cambiarne il ruolo o rimuoverlo.' : undefined}>
            {sortMembers(members.data ?? []).map((m) => (
              <Cell
                key={m.userId}
                icon={<AgentAvatar label={initialsOf(m.name ?? m.email ?? '?')} round />}
                title={`${m.name ?? m.email ?? 'Utente'}${m.isYou ? ' (tu)' : ''}`}
                subtitle={m.name && m.email ? m.email : undefined}
                right={<Pill>{ROLE_LABEL[m.role]}</Pill>}
                onPress={owner && !m.isYou ? () => manageMember(m) : undefined}
              />
            ))}
          </Section>

          {owner && (
            <Section
              header={invites.data?.length ? `Inviti in sospeso · ${invites.data.length}` : 'Inviti'}
              footer="Chi riceve l’invito lo vede nell’app, in Progetti, entrando con la stessa email.">
              {(invites.data ?? []).map((i) => (
                <Cell
                  key={i.id}
                  icon={<IconWell name="mail" />}
                  title={i.email}
                  subtitle={`${ROLE_LABEL[i.role]} · ${expiresIn(i.expiresAt)}`}
                  onPress={() => manageInvite(i.id, i.email)}
                />
              ))}
              <Cell
                icon={<IconWell name="add" background="transparent" />}
                title="Invita una persona"
                titleColor={t.accentText}
                onPress={() => router.push(routes.inviteMember(id))}
              />
            </Section>
          )}

          <Section style={{ marginTop: 24 }} inset={13}>
            {me && <Cell title="Esci dal team" titleColor={t.error} onPress={leave} />}
            {owner && <Cell title="Elimina team" titleColor={t.error} onPress={destroy} />}
          </Section>
        </Screen>
      )}
    </>
  );
}
