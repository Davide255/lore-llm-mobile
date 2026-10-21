import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';

import type { AgentPatch } from '@/api';
import { Icon } from '@/components/icon';
import { AGENT_KINDS, AgentAvatar } from '@/components/identity';
import { Cell, ErrorState, Loading, Screen, Section, SectionHeader } from '@/components/ui';
import { actions, attempt, useActivity, useAgent, useProjects } from '@/data/hooks';
import { relativeTime } from '@/lib/format';
import { basename } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { useTheme } from '@/theme';

const KIND_LABEL = { write: 'Modifica', create: 'Creazione', delete: 'Eliminazione' } as const;

/** Agent detail: permission, projects it may touch, recent changes, revoke. */
export default function AgentScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const agent = useAgent(id);
  const activity = useActivity();
  const projects = useProjects();
  const a = agent.data;
  const events = (activity.data ?? []).filter((e) => e.agent.id === id).slice(0, 5);

  const update = (patch: AgentPatch) => attempt(() => actions.updateAgent(id, patch), 'Impossibile aggiornare l’agente');

  const toggleProject = (name: string) => {
    if (!a) return;
    const current = a.scope.includes('*') ? [] : a.scope;
    const next = current.includes(name) ? current.filter((p) => p !== name) : [...current, name];
    update({ scope: next.length ? next : ['*'] });
  };

  const revoke = () =>
    Alert.alert(`Revocare ${a?.name}?`, 'Il suo token smette subito di funzionare. Le sue modifiche restano in Attività.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Revoca',
        style: 'destructive',
        onPress: async () => {
          const ok = await attempt(() => actions.revokeAgent(id).then(() => true));
          if (ok) router.back();
        },
      },
    ]);

  const check = (on: boolean) => (on ? <Icon name="check" size={17} color={t.accentText} weight="semibold" /> : undefined);

  return (
    <>
      <Stack.Screen options={{ title: a?.name ?? '' }} />
      {agent.loading ? (
        <Loading />
      ) : agent.error || !a ? (
        <ErrorState error={agent.error} onRetry={agent.refresh} />
      ) : (
        <Screen contentContainerStyle={{ paddingTop: 8 }}>
          <Section>
            <Cell
              icon={<AgentAvatar agent={a} round />}
              title={a.name}
              strong
              subtitle={`${AGENT_KINDS[a.kind].label} · ${a.lastWriteAt ? `ultima modifica ${relativeTime(a.lastWriteAt)}` : 'nessuna modifica'}`}
            />
          </Section>

          <SectionHeader>Permessi</SectionHeader>
          <View>
            <SegmentedControl
              values={['Sola lettura', 'Lettura e scrittura']}
              selectedIndex={a.permission === 'read' ? 0 : 1}
              onValueChange={(v) => update({ permission: v === 'Sola lettura' ? 'read' : 'read-write' })}
              appearance={t.scheme}
              tintColor={t.accent}
            />
          </View>

          <Section header="Progetti" footer="Il server applica permessi e progetti a ogni chiamata dell’agente." inset={13}>
            <Cell title="Tutti i progetti" right={check(a.scope.includes('*'))} onPress={() => update({ scope: ['*'] })} />
            {/* Agents work in the user's own projects; team projects are not in their scope list. */}
            {(projects.data ?? []).filter((p) => !p.team).map((p) => (
              <Cell
                key={p.name}
                title={p.name}
                right={check(!a.scope.includes('*') && a.scope.includes(p.name))}
                onPress={() => toggleProject(p.name)}
              />
            ))}
          </Section>

          <Section header="Modifiche recenti">
            {events.map((e) => (
              <Cell
                key={e.id}
                title={basename(e.path)}
                mono
                subtitle={`${KIND_LABEL[e.kind]} · ${e.project} · ${relativeTime(e.at)}`}
                chevron={!!e.changeId}
                onPress={e.changeId ? () => router.push(routes.change(e.changeId!)) : undefined}
              />
            ))}
          </Section>

          <Section style={{ marginTop: 24 }} inset={13}>
            <Cell title="Revoca agente" titleColor={t.error} onPress={revoke} />
          </Section>
        </Screen>
      )}
    </>
  );
}
