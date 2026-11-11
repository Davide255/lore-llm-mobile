import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Text } from 'react-native';

import type { TeamMember, TeamRole } from '@/api';
import { showActionSheet } from '@/components/action-sheet';
import { AgentAvatar, initialsOf } from '@/components/identity';
import { projectIcons } from '@/components/icon';
import { Cell, ErrorState, IconWell, Loading, Pill, Screen, Section } from '@/components/ui';
import { actions, attempt, useProjects, useTeam, useTeamInvites, useTeamMembers } from '@/data/hooks';
import { expiresIn, plural, relativeTime } from '@/lib/format';
import { routes } from '@/lib/routes';
import { ROLE_HINT, ROLE_LABEL, canManage, otherRoles, sortMembers } from '@/lib/teams';
import { useTheme } from '@/theme';

/** Team detail: its projects, members and pending invitations in one list, rename, leave or delete. */
export default function TeamScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const team = useTeam(id);
  const members = useTeamMembers(id);
  const owner = !!team.data && canManage(team.data.role);
  const invites = useTeamInvites(owner ? id : null);
  const me = members.data?.find((m) => m.isYou);
  const projects = (useProjects().data ?? []).filter((p) => p.team?.id === id);

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

          <Section header={`Progetti · ${projects.length}`} inset={projects.length ? 57 : 13}>
            {!projects.length && <Cell title="Nessun progetto" subtitle="Per condividerne uno, apri un tuo progetto e scegli «Sposta in un team…» dal menu." />}
            {projects.map((p) => (
              <Cell
                key={p.name}
                icon={<IconWell name={projectIcons[p.icon]} />}
                title={p.title}
                subtitle={`${plural(p.fileCount, 'file', 'file')} · ${relativeTime(p.updatedAt)}`}
                chevron
                onPress={() => router.push(routes.folder(p.name))}
              />
            ))}
          </Section>

          <Section
            header={`Membri · ${members.data?.length ?? 0}${invites.data?.length ? ` · ${plural(invites.data.length, 'invito', 'inviti')} in sospeso` : ''}`}
            footer={owner ? 'Tocca un membro per cambiarne il ruolo o rimuoverlo, un invito per revocarlo. Chi è invitato lo vede in Progetti, entrando con la stessa email.' : undefined}>
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
            {owner &&
              (invites.data ?? []).map((i) => (
                <Cell
                  key={i.id}
                  icon={<IconWell name="mail" />}
                  title={i.email}
                  subtitle={`Invito · ${expiresIn(i.expiresAt)}`}
                  right={<Pill>{ROLE_LABEL[i.role]}</Pill>}
                  onPress={() => manageInvite(i.id, i.email)}
                />
              ))}
            {owner && (
              <Cell
                icon={<IconWell name="add" background="transparent" />}
                title="Invita una persona"
                titleColor={t.accentText}
                onPress={() => router.push(routes.inviteMember(id))}
              />
            )}
          </Section>

          <Section style={{ marginTop: 24 }} inset={13}>
            {me && <Cell title="Esci dal team" titleColor={t.error} onPress={leave} />}
            {owner && <Cell title="Elimina team" titleColor={t.error} onPress={destroy} />}
          </Section>
        </Screen>
      )}
    </>
  );
}
