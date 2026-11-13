import { router, Stack } from 'expo-router';

import { AGENT_KINDS, AgentAvatar } from '@/components/identity';
import { McpLinkSection } from '@/components/mcp-link';
import { Cell, IconWell, Screen, Section } from '@/components/ui';
import { useAgents } from '@/data/hooks';
import { routes } from '@/lib/routes';
import { useTheme } from '@/theme';

/** Settings → Agents and connectors. Per-agent permissions are the only place that decides who writes. */
export default function AgentsSettingsScreen() {
  const t = useTheme();
  const agents = useAgents();
  return (
    <>
      <Stack.Screen options={{ title: 'Agenti e connettori', headerLargeTitle: false }} />
      <Screen contentContainerStyle={{ paddingTop: 8 }}>
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

        <McpLinkSection />
      </Screen>
    </>
  );
}
