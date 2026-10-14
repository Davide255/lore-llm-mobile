import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { ActivityEvent, Agent } from '@/api';
import { HeaderItems, type MenuItem } from '@/components/header-items';
import { AgentAvatar } from '@/components/identity';
import { Cell, EmptyState, ErrorState, Loading, Mono, Pill, Screen, Section } from '@/components/ui';
import { useActivity, useAgents } from '@/data/hooks';
import { dayBucket, eventTime } from '@/lib/format';
import { basename } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { useTheme, type Theme } from '@/theme';

type Filter = { kind: 'all' } | { kind: 'agent'; id: string };

function describe(e: ActivityEvent): ReactNode {
  const file = <Mono>{basename(e.path)}</Mono>;
  switch (e.kind) {
    case 'write':
      return <>Ha modificato {file}</>;
    case 'create':
      return <>Ha creato {file}</>;
    case 'delete':
      return <>Ha eliminato {file}</>;
  }
}

/** F1 — What agents changed, from the server's audit log. Changes the app saw happen open a diff. */
export default function ActivityScreen() {
  const t = useTheme();
  const activity = useActivity();
  const agents = useAgents();
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });

  const events = (activity.data ?? []).filter((e) => filter.kind === 'all' || e.agent.id === filter.id);
  const groups = new Map<string, ActivityEvent[]>();
  events.forEach((e) => {
    const k = dayBucket(e.at);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  });
  const [openedAt] = useState(Date.now);
  const dayAgo = openedAt - 24 * 60 * 60_000;
  const recentWrites = (activity.data ?? []).filter((e) => new Date(e.at).getTime() > dayAgo).length;

  const filterItems: MenuItem[] = [
    { label: 'Tutta l’attività', selected: filter.kind === 'all', onPress: () => setFilter({ kind: 'all' }) },
    ...(agents.data ?? []).map((a) => ({
      label: a.name,
      selected: filter.kind === 'agent' && filter.id === a.id,
      onPress: () => setFilter({ kind: 'agent', id: a.id }),
    })),
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Attività' }} />
      <HeaderItems right={[{ kind: 'menu', label: 'Filtra', icon: 'tune', title: 'Mostra', items: filterItems }]} />
      {activity.loading ? (
        <Loading />
      ) : activity.error ? (
        <ErrorState error={activity.error} onRetry={activity.refresh} />
      ) : (
        <Screen refreshControl={<RefreshControl refreshing={activity.refreshing} onRefresh={() => Promise.all([activity.refresh(), agents.refresh()])} />}>
          {agents.data && <AgentsSummary agents={agents.data} writes={recentWrites} t={t} />}

          {events.length === 0 && <EmptyState icon="bolt" title="Nessuna attività" message="Quando un agente crea, modifica o elimina un file, lo vedrai qui." />}

          {[...groups.entries()].map(([day, list]) => (
            <Section key={day} header={day}>
              {list.map((e) => {
                return (
                  <Cell
                    key={e.id}
                    alignTop
                    icon={<AgentAvatar agent={e.agent} round />}
                    title={describe(e)}
                    subtitle={
                      <>
                        {e.agent.name} · {e.project} · {eventTime(e.at)}
                      </>
                    }
                    chevron={!!e.changeId}
                    onPress={e.changeId ? () => router.push(routes.change(e.changeId!)) : undefined}>
                    {e.added || e.removed ? (
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
                        {!!e.added && <Pill color={t.success} background={t.successSoft}>{`+${e.added} righe`}</Pill>}
                        {!!e.removed && <Pill color={t.error} background={t.errorSoft}>{`−${e.removed}`}</Pill>}
                      </View>
                    ) : null}
                  </Cell>
                );
              })}
            </Section>
          ))}
        </Screen>
      )}
    </>
  );
}

function AgentsSummary({ agents, writes, t }: { agents: Agent[]; writes: number; t: Theme }) {
  const shown = agents.slice(0, 2);
  const rest = agents.length - shown.length;
  return (
    <View style={[styles.summary, { backgroundColor: t.cell }]}>
      <View style={{ flexDirection: 'row' }}>
        {shown.map((a, i) => (
          <View key={a.id} style={[styles.ring, { borderColor: t.cell, marginLeft: i ? -11 : 0 }]}>
            <AgentAvatar agent={a} size={30} round />
          </View>
        ))}
        {rest > 0 && (
          <View style={[styles.ring, { borderColor: t.cell, marginLeft: shown.length ? -11 : 0 }]}>
            <AgentAvatar label={`+${rest}`} size={30} round />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: t.text }}>
          {agents.length === 1 ? '1 agente collegato' : `${agents.length} agenti collegati`}
        </Text>
        <Text style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
          {writes === 1 ? '1 modifica' : `${writes} modifiche`} nelle ultime 24 h
        </Text>
      </View>
      <View style={[styles.dot, { backgroundColor: t.success }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 16, marginTop: 4 },
  ring: { borderWidth: 2, borderRadius: 17 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
