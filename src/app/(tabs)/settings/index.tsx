import { SegmentedControl } from '@expo/ui/community/segmented-control';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';

import { authUser, providerLabels, signOut } from '@/auth/session';
import { AGENT_KINDS, AgentAvatar, initialsOf } from '@/components/identity';
import { PendingInvites } from '@/components/invites';
import { McpLinkSection } from '@/components/mcp-link';
import { Cell, IconWell, Screen, Section, SectionHeader } from '@/components/ui';
import { actions, attempt, useAgents, useSettings, useSummary, useTeams } from '@/data/hooks';
import { fileSize, relativeTime } from '@/lib/format';
import { checkForOtaUpdate, currentOtaLabel, otaEnabled, otaPhase as otaPhaseSignal, type OtaPhase } from '@/lib/ota';
import { routes } from '@/lib/routes';
import { ROLE_LABEL } from '@/lib/teams';
import { useTheme } from '@/theme';
import { setAppearance, useAppearance, type AppearancePreference } from '@/theme/appearance';

const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
];

const otaStatusLabels: Record<OtaPhase, string> = {
  idle: 'Nessun controllo',
  checking: 'Controllo…',
  downloading: 'Download in corso…',
  ready: 'Scaricato: si installa al prossimo avvio',
  current: 'Aggiornato',
  error: 'Impossibile controllare',
};

/** F3 — Settings. Per-agent permissions are the only place that decides who writes. */
export default function SettingsScreen() {
  const t = useTheme();
  const user = authUser.useValue();
  const settings = useSettings();
  const summary = useSummary();
  const agents = useAgents();
  const teams = useTeams();
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const appearance = useAppearance();
  const otaPhase = otaPhaseSignal.useValue();
  const s = settings.data;

  const sync = async () => {
    setSyncing(true);
    await attempt(() => actions.sync(), 'Sincronizzazione non riuscita');
    setSyncing(false);
  };

  const confirmSignOut = () =>
    Alert.alert('Uscire?', 'La knowledge base resta sul server: ritrovi tutto accedendo di nuovo.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: () => signOut() },
    ]);

  const deleteAccount = async () => {
    setDeleting(true);
    const done = await attempt(
      () => actions.deleteAccount().then(() => true),
      'Account non eliminato',
    );
    setDeleting(false);
    if (done) await signOut();
  };

  // Two steps, the second one naming what goes away: there is no way back.
  const confirmDeleteAccount = () =>
    Alert.alert(
      'Eliminare l’account?',
      'Verranno cancellati per sempre i tuoi progetti e file, gli agenti collegati, le tue iscrizioni ai team e l’accesso con Google o Apple. Non si può annullare.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Continua',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Ultima conferma', 'Eliminare definitivamente l’account e tutti i suoi dati?', [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Elimina account', style: 'destructive', onPress: deleteAccount },
            ]),
        },
      ],
    );

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
            />
            <Cell icon={<IconWell name="logout" />} title="Esci" titleColor={t.error} onPress={confirmSignOut} />
            <Cell
              icon={<IconWell name="delete" />}
              title="Elimina account"
              subtitle="Cancella per sempre account, file e agenti"
              titleColor={t.error}
              right={deleting ? <ActivityIndicator color={t.textMuted} /> : undefined}
              disabled={deleting}
              onPress={confirmDeleteAccount}
            />
          </Section>
        )}

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
            chevron={!syncing}
            onPress={syncing ? undefined : sync}
          />
        </Section>

        <PendingInvites />

        <Section header="Team" footer="Condividi progetti con altre persone: ognuna ha il suo ruolo (proprietario, editor, sola lettura).">
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
          <Cell
            icon={<IconWell name="add" background="transparent" />}
            title="Crea un team"
            titleColor={t.accentText}
            onPress={() => router.push(routes.newTeam())}
          />
        </Section>

        <Section header="Agenti" footer="Ogni agente ha il suo token: il server applica permessi e progetti a ogni chiamata. Revocarlo lo blocca subito.">
          {(agents.data ?? []).map((a) => (
            <Cell
              key={a.id}
              icon={<AgentAvatar agent={a} round />}
              title={a.name}
              subtitle={[
                a.name !== AGENT_KINDS[a.kind].label ? AGENT_KINDS[a.kind].label : null,
                a.permission === 'read-write' ? 'Lettura e scrittura' : 'Sola lettura',
                a.scope.includes('*') ? null : a.scope.length === 1 ? a.scope[0] : `${a.scope.length} progetti`,
              ]
                .filter(Boolean)
                .join(' · ')}
              chevron
              onPress={() => router.push(routes.agent(a.id))}
            />
          ))}
          <Cell
            icon={<IconWell name="add" background="transparent" />}
            title="Collega un agente"
            titleColor={t.accentText}
            onPress={() => router.push(routes.connectAgent())}
          />
        </Section>

        <Section header="Versione e aggiornamenti">
          <Cell
            icon={<IconWell name={otaPhase === 'checking' || otaPhase === 'downloading' ? 'sync' : 'cloudDone'} />}
            title="Controlla aggiornamenti"
            subtitle={`${Constants.expoConfig?.version ?? ''} · ${currentOtaLabel()} · ${otaStatusLabels[otaPhase]}`}
            right={otaPhase === 'checking' || otaPhase === 'downloading' ? <ActivityIndicator color={t.textMuted} /> : undefined}
            onPress={otaEnabled && otaPhase !== 'checking' && otaPhase !== 'downloading' ? () => void checkForOtaUpdate({ force: true }) : undefined}
          />
        </Section>

        <McpLinkSection />

        <SectionHeader>Aspetto</SectionHeader>
        <SegmentedControl
          values={appearanceOptions.map((o) => o.label)}
          selectedIndex={appearanceOptions.findIndex((o) => o.value === appearance)}
          onValueChange={(label) => setAppearance(appearanceOptions.find((o) => o.label === label)!.value)}
          appearance={t.scheme}
          tintColor={t.accent}
        />
      </Screen>
    </>
  );
}
