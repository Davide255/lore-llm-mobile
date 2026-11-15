import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { BigButton, SessionProgress } from '@/components/study/parts';
import { EmptyState, Pill, Screen } from '@/components/ui';
import { abortSession, retryGeneration, studySession, type SourceProgress } from '@/data/study';
import { basename } from '@/lib/paths';
import { useCloseSession } from '@/components/study/use-close-session';
import { routes } from '@/lib/routes';
import { brand, useTheme } from '@/theme';

/**
 * B1 — While the AI reads the notes: progress file by file, then the topics it
 * found and the questions as they arrive. Claude reads a PDF whole, so there is
 * no page-by-page progress to show (the design's «p. 9/14»): only per file.
 */
export default function GeneratingScreen() {
  const t = useTheme();
  const s = studySession.useValue();
  const exit = useCloseSession();

  useEffect(() => {
    if (s?.phase === 'answering') router.replace(routes.studySession('quiz'));
  }, [s?.phase]);

  const close = () => {
    if (s?.phase !== 'generating') {
      abortSession();
      exit();
      return;
    }
    Alert.alert('Interrompere la preparazione?', 'Le domande preparate finora andranno perse.', [
      { text: 'Continua', style: 'cancel' },
      {
        text: 'Interrompi',
        style: 'destructive',
        onPress: () => {
          abortSession();
          exit();
        },
      },
    ]);
  };

  if (!s) return <EmptyState icon="school" title="Nessuna sessione in corso" />;
  const failed = s.phase === 'generate_failed';

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <HeaderItems left={[{ kind: 'button', label: 'Chiudi', icon: 'close', onPress: close }]} />
      <Screen>
        <View style={{ alignItems: 'center', paddingTop: 28 }}>
          <View style={[styles.badge, { experimental_backgroundImage: brand.gradient, backgroundColor: brand.purple }]}>
            <Icon name={failed ? 'warning' : 'school'} size={34} color="#fff" />
          </View>
          <Text style={[styles.title, { color: t.text }]}>{failed ? 'Preparazione non riuscita' : 'Sto leggendo i tuoi appunti'}</Text>
          <Text style={[styles.sub, { color: t.textSecondary }]}>
            {failed ? s.error : `Preparo ${s.total} domande sugli argomenti che compaiono più spesso.`}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: t.cell }]}>
          {s.files.map((f) => (
            <FileRow key={f.path} file={f} />
          ))}
        </View>

        {s.topics.length ? (
          <View style={styles.topics}>
            {s.topics.map((topic) => (
              <Pill key={topic} size="md" background={t.accentSoft} color={t.accentText}>
                {topic}
              </Pill>
            ))}
          </View>
        ) : null}

        {!failed ? (
          <View style={{ marginTop: 24, gap: 8 }}>
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>
              {s.questions.length ? `Domande pronte: ${s.questions.length} di ${s.total}` : s.files.every((f) => f.status !== 'loading') ? 'L’AI sta scrivendo le domande…' : 'Carico gli appunti…'}
            </Text>
            <SessionProgress index={s.questions.length} total={s.total} />
          </View>
        ) : (
          <View style={{ marginTop: 28, gap: 10 }}>
            <BigButton label="Riprova" icon="restore" onPress={retryGeneration} />
            <BigButton label="Chiudi" variant="plain" onPress={close} />
          </View>
        )}
      </Screen>
    </>
  );
}

function FileRow({ file }: { file: SourceProgress }) {
  const t = useTheme();
  const status =
    file.status === 'ready' ? 'letto' : file.status === 'skipped' ? (file.reason ?? 'saltato') : 'in lettura';
  return (
    <View style={styles.file}>
      {file.status === 'loading' ? (
        <ActivityIndicator size="small" color={t.accentText} style={{ width: 20 }} />
      ) : (
        <Icon name={file.status === 'ready' ? 'checkCircle' : 'warning'} size={20} color={file.status === 'ready' ? t.success : t.warning} />
      )}
      <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14.5 }}>
        {basename(file.path)}
      </Text>
      <Text style={{ color: t.textMuted, fontSize: 12.5 }}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginTop: 18, textAlign: 'center' },
  sub: { fontSize: 14.5, lineHeight: 20, marginTop: 6, textAlign: 'center', maxWidth: 300 },
  card: { borderRadius: 16, paddingVertical: 4, marginTop: 26, borderCurve: 'continuous' },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
});
