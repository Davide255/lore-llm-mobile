import { SegmentedControl } from '@expo/ui/community/segmented-control';
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AGENT_KIND_LIST, type AgentKind, type AgentPermission, type NewAgent } from '@/api';
import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { AGENT_KINDS, AgentAvatar } from '@/components/identity';
import { McpLinkSection } from '@/components/mcp-link';
import { Banner, Cell, Section, SectionHeader } from '@/components/ui';
import { actions, attempt } from '@/data/hooks';
import { fonts, useTheme } from '@/theme';

const permissions: { value: AgentPermission; label: string }[] = [
  { value: 'read-write', label: 'Lettura e scrittura' },
  { value: 'read', label: 'Sola lettura' },
];

/** F4 — Register an agent on the server: pick the client, name it, choose what it may do. */
export default function ConnectAgentScreen() {
  const t = useTheme();
  const [kind, setKind] = useState<AgentKind>('claude');
  const [name, setName] = useState('');
  const [permission, setPermission] = useState<AgentPermission>('read-write');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<NewAgent | null>(null);
  // An empty name falls back to the client's name ("Claude", "Codex").
  const finalName = name.trim() || AGENT_KINDS[kind].label;

  const create = async () => {
    setBusy(true);
    const res = await attempt(() => actions.createAgent({ kind, name: finalName, permission, scope: ['*'] }), 'Impossibile collegare l’agente');
    setBusy(false);
    if (res) setCreated(res);
  };

  if (created) return <TokenView created={created} />;

  return (
    <>
      <HeaderItems
        left={[{ kind: 'button', label: 'Annulla', onPress: () => router.back() }]}
        right={[{ kind: 'button', label: 'Collega', variant: 'prominent', disabled: busy, onPress: create }]}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.background }}
        contentContainerStyle={{ padding: 16, paddingTop: 12 }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        <McpLinkSection />

        <SectionHeader>Oppure con un token · tipo di agente</SectionHeader>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
          {AGENT_KIND_LIST.map((k) => {
            const on = k === kind;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={AGENT_KINDS[k].label}
                onPress={() => setKind(k)}
                style={[styles.kind, { backgroundColor: on ? t.accentSoft : t.cell, borderColor: on ? t.accent : 'transparent' }]}>
                <AgentAvatar agent={{ name: AGENT_KINDS[k].label, kind: k }} size={36} round />
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '600', marginTop: 8 }}>{AGENT_KINDS[k].label}</Text>
                <Text style={{ color: t.textSecondary, fontSize: 11.5, marginTop: 2, textAlign: 'center' }}>{AGENT_KINDS[k].hint}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionHeader>Nome</SectionHeader>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={`${AGENT_KINDS[kind].label} (es. “${AGENT_KINDS[kind].label} lavoro”)`}
          placeholderTextColor={t.textMuted}
          selectionColor={t.accentText}
          returnKeyType="done"
          maxLength={64}
          style={[styles.field, { backgroundColor: t.cell, color: t.text }]}
        />
        <Text style={[styles.hint, { color: t.textMuted }]}>Il nome con cui l’agente compare in Attività.</Text>

        <SectionHeader>Permessi</SectionHeader>
        <SegmentedControl
          values={permissions.map((p) => p.label)}
          selectedIndex={permissions.findIndex((p) => p.value === permission)}
          onValueChange={(label) => setPermission(permissions.find((p) => p.label === label)!.value)}
          appearance={t.scheme}
          tintColor={t.accent}
        />
        <Text style={[styles.hint, { color: t.textMuted }]}>Potrai cambiare permessi e progetti in qualsiasi momento.</Text>
      </ScrollView>
    </>
  );
}

/** The token exists only on this screen: the server keeps no copy. */
function TokenView({ created }: { created: NewAgent }) {
  const t = useTheme();
  // Inline feedback: the global toast would render underneath this modal.
  const [copied, setCopied] = useState<string | null>(null);
  const { agent, token, mcpUrl } = created;
  const setup =
    agent.kind === 'codex'
      ? {
          label: 'Codex · ~/.codex/config.toml',
          text: `[mcp_servers.lore]\nurl = "${mcpUrl}"\nhttp_headers = { Authorization = "Bearer ${token}" }`,
        }
      : { label: 'Claude Code', text: `claude mcp add --transport http lore ${mcpUrl} --header "Authorization: Bearer ${token}"` };

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
  };

  const rows = [
    { label: 'Token', value: token },
    { label: setup.label, value: setup.text },
    { label: 'Endpoint MCP', value: mcpUrl },
  ];

  return (
    <>
      {/* No swipe-to-dismiss: the token would be gone before it was copied. */}
      <Stack.Screen options={{ title: 'Agente collegato', gestureEnabled: false }} />
      <HeaderItems left={[]} right={[{ kind: 'button', label: 'Fine', variant: 'done', onPress: () => router.back() }]} />
      <ScrollView style={{ flex: 1, backgroundColor: t.background }} contentContainerStyle={{ padding: 16 }} contentInsetAdjustmentBehavior="automatic">
        <Section inset={13}>
          <Cell
            icon={<AgentAvatar agent={agent} size={36} round />}
            title={agent.name}
            strong
            subtitle={`${AGENT_KINDS[agent.kind].label} · ${agent.permission === 'read-write' ? 'lettura e scrittura' : 'sola lettura'}`}
          />
        </Section>
        <Text style={{ color: t.textSecondary, fontSize: 14, lineHeight: 20, marginHorizontal: 6, marginTop: 14 }}>
          Copia ora il token: non verrà più mostrato. Scade il {new Date(created.expiresAt).toLocaleDateString('it-IT')}.
        </Text>
        <Section header="Configurazione" inset={13}>
          {rows.map((row) => (
            <Cell
              key={row.label}
              alignTop
              title={row.label}
              right={<Icon name={copied === row.label ? 'check' : 'copy'} size={17} color={t.accentText} />}
              onPress={() => copy(row.label, row.value)}>
              <Text selectable style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: t.textSecondary, marginTop: 4 }}>
                {row.value}
              </Text>
            </Cell>
          ))}
        </Section>
        <View style={{ marginTop: 18 }}>
          <Banner icon="lock">Trattalo come una password. Se lo perdi, revoca l’agente e collegane uno nuovo.</Banner>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  kind: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1.5, borderCurve: 'continuous' },
  field: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 16 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 7, marginHorizontal: 6 },
});
