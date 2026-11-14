import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { authUser, providerLabels } from '@/auth/session';
import { AgentAvatar, initialsOf } from '@/components/identity';
import { Cell, IconWell, Screen, Section } from '@/components/ui';
import { actions, attempt, useAgents, useSettings, useSummary, useTeams } from '@/data/hooks';
import { fileSize, plural, relativeTime } from '@/lib/format';
import { studyProfiles } from '@/data/study';
import { checkForOtaUpdate, currentOtaLabel, otaEnabled, otaPhase as otaPhaseSignal, type OtaPhase } from '@/lib/ota';
import { routes } from '@/lib/routes';
import { useTheme } from '@/theme';
import { appearanceOptions, useAppearance } from '@/theme/appearance';
import { useTextScale } from '@/theme/text-size';

const otaStatusLabels: Record<OtaPhase, string> = {
  idle: 'Nessun controllo',
  checking: 'Controllo…',
  downloading: 'Download in corso…',
  ready: 'Scaricato: si installa al prossimo avvio',
  current: 'Aggiornato',
  error: 'Impossibile controllare',
};

/**
 * F3 — Settings, split by section: the account on top, then collaboration (teams,
 * agents), the app's look, and the knowledge base's sync and version. Each section
 * with a list of its own opens a sub-page.
 */
export default function SettingsScreen() {
  const t = useTheme();
  const user = authUser.useValue();
  const settings = useSettings();
  const summary = useSummary();
  const agents = useAgents();
  const teams = useTeams();
  const appearance = useAppearance();
  const textScale = useTextScale();
  const otaPhase = otaPhaseSignal.useValue();
  const profiles = studyProfiles.useValue();
  const [syncing, setSyncing] = useState(false);
  const s = settings.data;
  const otaBusy = otaPhase === 'checking' || otaPhase === 'downloading';

  const sync = async () => {
    setSyncing(true);
    await attempt(() => actions.sync(), 'Sincronizzazione non riuscita');
    setSyncing(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Impostazioni' }} />
      <Screen>
        {user && (
          <Section header="Account">
            <Cell
              icon={<AgentAvatar label={initialsOf(user.name)} round />}
              title={user.name}
              strong
              subtitle={user.email ? `${user.email} · ${providerLabels[user.provider]}` : `Account ${providerLabels[user.provider]}`}
              chevron
              onPress={() => router.push(routes.settings('account'))}
            />
          </Section>
        )}

        <Section header="Collaborazione">
          <Cell
            icon={<IconWell name="team" />}
            title="Team"
            subtitle={teams.data?.length ? (teams.data.length === 1 ? teams.data[0]!.name : `${teams.data.length} team`) : 'Condividi progetti con altre persone'}
            chevron
            onPress={() => router.push(routes.settings('teams'))}
          />
          <Cell
            icon={<IconWell name="robot" />}
            title="Agenti e connettori"
            subtitle={agents.data?.length ? plural(agents.data.length, 'agente collegato', 'agenti collegati') : 'Collega Claude o un altro agente'}
            chevron
            onPress={() => router.push(routes.settings('agents'))}
          />
        </Section>

        <Section header="Studio">
          <Cell
            icon={<IconWell name="school" />}
            title="Profili di valutazione"
            subtitle={profiles.length === 1 ? profiles[0]!.name : `${profiles.length} profili · ${profiles.slice(0, 2).map((p) => p.name).join(', ')}${profiles.length > 2 ? '…' : ''}`}
            chevron
            onPress={() => router.push(routes.studyProfiles())}
          />
        </Section>

        <Section header="App">
          <Cell
            icon={<IconWell name="design" />}
            title="Aspetto"
            subtitle={`${appearanceOptions.find((o) => o.value === appearance)?.label ?? ''} · testo ${Math.round(textScale * 100)}%`}
            chevron
            onPress={() => router.push(routes.settings('appearance'))}
          />
        </Section>

        <Section header="Base di conoscenza" footer={s ? `Server: ${s.server}` : undefined}>
          <Cell
            icon={<IconWell name={syncing ? 'sync' : 'cloudDone'} />}
            title="Sincronizzazione"
            subtitle={
              syncing
                ? 'Sincronizzazione in corso…'
                : `${relativeTime(s?.lastSyncAt)}${summary.data ? ` · ${summary.data.fileCount} file, ${fileSize(summary.data.totalBytes)}` : ''}`
            }
            right={syncing ? <ActivityIndicator color={t.textMuted} /> : undefined}
            onPress={syncing ? undefined : sync}
          />
          <Cell
            icon={<IconWell name={otaBusy ? 'sync' : 'update'} />}
            title="Controlla aggiornamenti"
            subtitle={`${Constants.expoConfig?.version ?? ''} · ${currentOtaLabel()} · ${otaStatusLabels[otaPhase]}`}
            right={otaBusy ? <ActivityIndicator color={t.textMuted} /> : undefined}
            onPress={otaEnabled && !otaBusy ? () => void checkForOtaUpdate({ force: true }) : undefined}
          />
        </Section>
      </Screen>
    </>
  );
}
