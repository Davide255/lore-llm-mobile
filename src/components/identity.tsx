import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import type { AgentKind, AgentRef, Author } from '@/api';
import { brand, useTheme } from '@/theme';

/** The agent clients the app knows how to present. Order = order in the picker. */
export const AGENT_KINDS: Record<AgentKind, { label: string; avatar: string; hint: string }> = {
  claude: {
    label: 'Claude',
    avatar: 'https://avatars.githubusercontent.com/u/81847?v=4',
    hint: 'Claude Code o Claude Desktop',
  },
  codex: {
    label: 'Codex',
    avatar: 'https://avatars.githubusercontent.com/u/14957082?v=4',
    hint: 'Codex CLI o app Codex',
  },
};

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** An agent's face: its client's picture, or initials when unknown, revoked or offline. */
export function AgentAvatar({
  agent,
  size = 32,
  round,
  label,
}: {
  agent?: Pick<AgentRef, 'name' | 'kind'> | null;
  size?: number;
  round?: boolean;
  /** Shown instead of the initials (e.g. "+3"). */
  label?: string;
}) {
  const t = useTheme();
  const [broken, setBroken] = useState(false);
  const kind = agent?.kind ?? null;
  const shape = { width: size, height: size, borderRadius: round ? size / 2 : size * 0.28, overflow: 'hidden' as const };
  if (kind && !broken && !label) {
    return (
      <View accessibilityLabel={agent?.name ?? AGENT_KINDS[kind].label} style={[shape, { backgroundColor: t.iconWell }]}>
        <Image source={{ uri: AGENT_KINDS[kind].avatar }} onError={() => setBroken(true)} style={{ width: size, height: size }} />
      </View>
    );
  }
  const tinted = !label && !!agent;
  return (
    <View style={[shape, { alignItems: 'center', justifyContent: 'center', backgroundColor: tinted ? brand.purple : t.iconWell }]}>
      <Text style={{ fontSize: Math.round(size * 0.34), fontWeight: '700', color: tinted ? '#fff' : t.textSecondary }}>
        {label ?? (agent ? initialsOf(agent.name) : 'AG')}
      </Text>
    </View>
  );
}

/** "Tu" or the agent's name, for "edited by" captions. */
export const authorName = (author: Author, agent?: AgentRef) => (author === 'you' ? 'Tu' : (agent?.name ?? 'Agente'));
