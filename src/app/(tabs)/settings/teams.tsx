import { router, Stack } from 'expo-router';

import { PendingInvites } from '@/components/invites';
import { Cell, IconWell, Screen, Section } from '@/components/ui';
import { useTeams } from '@/data/hooks';
import { routes } from '@/lib/routes';
import { ROLE_LABEL } from '@/lib/teams';
import { useTheme } from '@/theme';

/** Settings → Team: the user's teams and pending invitations. */
export default function TeamsSettingsScreen() {
  const t = useTheme();
  const teams = useTeams();
  return (
    <>
      <Stack.Screen options={{ title: 'Team', headerLargeTitle: false }} />
      <Screen contentContainerStyle={{ paddingTop: 8 }}>
        <PendingInvites />
        <Section header="I tuoi team" footer="Condividi progetti con altre persone: ognuna ha il suo ruolo (proprietario, editor, sola lettura).">
          {(teams.data ?? []).map((team) => (
            <Cell
              key={team.id}
              icon={<IconWell name="team" />}
              title={team.name}
              subtitle={ROLE_LABEL[team.role]}
              chevron
              onPress={() => router.push(routes.team(team.id))}
            />
          ))}
          <Cell icon={<IconWell name="add" background="transparent" />} title="Crea un team" titleColor={t.accentText} onPress={() => router.push(routes.newTeam())} />
        </Section>
      </Screen>
    </>
  );
}
