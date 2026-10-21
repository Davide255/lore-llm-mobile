import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Text } from 'react-native';

import { Icon } from '@/components/icon';
import { Cell, Section } from '@/components/ui';
import { useSettings } from '@/data/hooks';
import { fonts, useTheme } from '@/theme';

/**
 * The MCP link to paste into Claude (or any connector that supports OAuth): Settings →
 * Connectors → Add custom connector. Signing in with the Lore account mints the agent, so
 * no token is involved. Feedback is inline: this also renders inside modals, where the
 * global toast would be hidden.
 */
export function McpLinkSection() {
  const t = useTheme();
  const url = useSettings().data?.mcpUrl;
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Section
      header="Claude e altri connettori"
      footer="In Claude: Impostazioni → Connettori → Aggiungi connettore personalizzato, incolla il link e accedi con il tuo account Lore. Nessun token: l’agente compare qui dopo l’accesso."
      inset={13}>
      <Cell
        alignTop
        title="Link MCP"
        right={<Icon name={copied ? 'check' : 'copy'} size={17} color={t.accentText} />}
        onPress={copy}>
        <Text selectable style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: t.textSecondary, marginTop: 4 }}>
          {url}
        </Text>
      </Cell>
    </Section>
  );
}
