import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { showToast } from '@/components/toast';
import { actions, attempt, useTeams } from '@/data/hooks';
import { projectLabel, teamProjectKey } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { canWrite, ROLE_LABEL } from '@/lib/teams';
import { useTheme } from '@/theme';

/** Bottom sheet to move one of the user's projects into a team: pick the team, then confirm. */
export default function MoveToTeamScreen() {
  const t = useTheme();
  const { project, reopen } = useLocalSearchParams<{ project: string; reopen?: string }>();
  const teams = useTeams();
  const writable = (teams.data ?? []).filter((x) => canWrite(x.role));
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = projectLabel(project);
  const team = writable.find((x) => x.id === (picked ?? (writable.length === 1 ? writable[0]!.id : null)));

  const confirm = async () => {
    if (!team) return;
    setBusy(true);
    const ok = await attempt(() => actions.moveProjectToTeam(project, team.id).then(() => true), 'Impossibile spostare il progetto');
    setBusy(false);
    if (!ok) return;
    router.dismiss();
    showToast({ icon: 'team', subject: label, message: `ora è di ${team.name}` });
    // The caller is showing the project: follow it to its new key.
    if (reopen) router.replace(routes.folder(teamProjectKey(project, team.id)));
  };

  return (
    <View style={[styles.sheet, { backgroundColor: t.sheet }]}>
      <Text style={[styles.title, { color: t.text }]}>Sposta “{label}” in un team</Text>
      <Text style={[styles.message, { color: t.textSecondary }]}>
        Non sarà più solo tuo: lo gestirà il team e i membri lo vedranno in base al loro ruolo. Gli agenti collegati al tuo account non lo vedranno più.
      </Text>

      {teams.loading ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : writable.length === 0 ? (
        <Text style={[styles.message, { color: t.textMuted, marginTop: 0 }]}>
          Nessun team: creane uno in Impostazioni, oppure fatti dare il ruolo di editor in un team esistente.
        </Text>
      ) : (
        <View style={[styles.list, { backgroundColor: t.fillSubtle }]}>
          {writable.map((x, i) => {
            const selected = team?.id === x.id;
            return (
              <Pressable
                key={x.id}
                onPress={() => setPicked(x.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline },
                  pressed && { backgroundColor: t.fill },
                ]}>
                <Icon name="team" size={21} color={t.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: t.text }}>{x.name}</Text>
                  <Text style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>{ROLE_LABEL[x.role]}</Text>
                </View>
                <Icon name={selected ? 'checkCircle' : 'circle'} size={22} color={selected ? t.accentText : t.textMuted} />
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable
        onPress={confirm}
        disabled={!team || busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { backgroundColor: t.accent, marginTop: 18, opacity: !team ? 0.4 : busy ? 0.7 : pressed ? 0.85 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Sposta</Text>}
      </Pressable>
      <Pressable
        onPress={() => router.dismiss()}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { backgroundColor: t.fill, marginTop: 8, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[styles.secondaryLabel, { color: t.text }]}>Annulla</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 34 },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  list: { borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 12 },
  button: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryLabel: { fontSize: 16, fontWeight: '600' },
});
