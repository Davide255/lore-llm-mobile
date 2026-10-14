import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { showToast } from '@/components/toast';
import { ErrorState, HeaderTitle, Loading, Pill, Screen } from '@/components/ui';
import { actions, attempt, useChange } from '@/data/hooks';
import { diffLines, toHunks } from '@/lib/diff';
import { relativeTime } from '@/lib/format';
import { basename } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { fonts, useTheme } from '@/theme';

/** F2 — Unified diff of an agent's change, with restore. */
export default function ChangeScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const change = useChange(id);
  const c = change.data;
  const hunks = useMemo(() => (c ? toHunks(diffLines(c.before ?? '', c.after ?? '')) : []), [c]);

  const restore = () => {
    if (!c) return;
    Alert.alert(
      'Ripristinare la versione precedente?',
      c.before === null
        ? `${basename(c.path)} è stato creato da ${c.agent.name}: ripristinare lo elimina.`
        : `${basename(c.path)} tornerà com’era prima della modifica di ${c.agent.name}.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Ripristina',
          style: 'destructive',
          onPress: async () => {
            const ok = await attempt(() => actions.revertChange(c.id).then(() => true), 'Ripristino non riuscito');
            if (ok) showToast({ icon: 'restore', subject: basename(c.path), message: 'ripristinato' });
          },
        },
      ],
    );
  };

  const shareDiff = () => {
    const text = hunks
      .map((h) => [`@@ ${h.title ?? ''}`, ...h.lines.map((l) => (l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  ') + l.text)].join('\n'))
      .join('\n');
    Share.share({ message: text });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle
              title={`Modifica di ${c?.agent.name ?? '…'}`}
              subtitle={c ? `${basename(c.path)} · ${relativeTime(c.at)}` : undefined}
              mono={false}
            />
          ),
        }}
      />
      {c && (
        <HeaderItems
          right={[
            {
              kind: 'menu',
              label: 'Altro',
              icon: 'more',
              items: [
                { label: 'Apri file', icon: 'doc', disabled: c.after === null, onPress: () => router.push(routes.file(c.path)) },
                { label: 'Condividi diff', icon: 'share', onPress: shareDiff },
                { label: 'Ripristina', icon: 'restore', destructive: true, disabled: !c.restorable, onPress: restore },
              ],
            },
          ]}
        />
      )}
      {change.loading ? (
        <Loading />
      ) : change.error || !c ? (
        <ErrorState error={change.error} onRetry={change.refresh} />
      ) : (
        <Screen contentContainerStyle={{ paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 7, marginBottom: 14 }}>
            <Pill color={t.success} background={t.successSoft}>{`+${c.added} righe`}</Pill>
            <Pill color={t.error} background={t.errorSoft}>{`−${c.removed} righe`}</Pill>
            {c.before === null && <Pill>nuovo file</Pill>}
            {c.after === null && <Pill>eliminato</Pill>}
          </View>

          <View style={[styles.diff, { backgroundColor: t.cell }]}>
            {hunks.map((h, hi) => (
              <View key={hi}>
                <Text
                  style={[
                    styles.hunk,
                    { color: t.textMuted, borderColor: t.hairline },
                    hi > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                  ]}>
                  @@ {h.title ?? 'Inizio file'}
                </Text>
                {h.lines.map((l, li) => (
                  <Text
                    key={li}
                    style={[
                      styles.line,
                      l.type === 'add' && { backgroundColor: t.successLine, color: t.successText },
                      l.type === 'del' && { backgroundColor: t.errorLine, color: t.errorText },
                      l.type === 'ctx' && { color: t.textSecondary },
                    ]}>
                    {l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}
                    {l.text || ' '}
                  </Text>
                ))}
              </View>
            ))}
            <View style={{ height: 8 }} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable
              disabled={!c.restorable}
              onPress={restore}
              style={[styles.big, { backgroundColor: t.fill, opacity: c.restorable ? 1 : 0.4 }]}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Ripristina</Text>
            </Pressable>
            <Pressable
              disabled={c.after === null}
              onPress={() => router.push(routes.file(c.path))}
              style={[styles.big, { backgroundColor: t.accent, opacity: c.after === null ? 0.4 : 1 }]}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Apri file</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 11.5, lineHeight: 17, color: t.textMuted, marginTop: 12, marginHorizontal: 6, textAlign: 'center' }}>
            {c.restorable
              ? 'Il ripristino riporta il file alla versione precedente alla modifica.'
              : 'Il file è cambiato dopo questa modifica: non si può più ripristinare.'}
          </Text>
        </Screen>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  diff: { borderRadius: 14, overflow: 'hidden' },
  hunk: { fontFamily: fonts.mono, fontSize: 11.5, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { fontFamily: fonts.mono, fontSize: 11.5, lineHeight: 21, paddingHorizontal: 12 },
  big: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
