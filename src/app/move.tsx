import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { showToast } from '@/components/toast';
import { Cell, IconWell, Loading, Section } from '@/components/ui';
import { actions, attempt, useFolderTree } from '@/data/hooks';
import { basename, dirname, projectLabel, projectOf, splitPath } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { useTheme } from '@/theme';

/** "Sposta in…" — pick a destination folder within the same project. */
export default function MoveScreen() {
  const t = useTheme();
  const { path, reopen } = useLocalSearchParams<{ path: string; reopen?: string }>();
  const tree = useFolderTree(projectOf(path));
  const from = dirname(path);

  const moveTo = async (folder: string) => {
    const target = await attempt(() => actions.move(path, folder), 'Impossibile spostare');
    if (!target) return;
    router.back();
    if (reopen) router.replace(target.endsWith('.md') ? routes.file(target) : routes.folder(target));
    showToast({ icon: 'move', subject: basename(path), message: `spostato in ${basename(folder)}/` });
  };

  const options = (tree.data ?? []).filter((f) => f !== path && !f.startsWith(path + '/'));

  return (
    <>
      <HeaderItems left={[{ kind: 'button', label: 'Annulla', onPress: () => router.back() }]} />
      {tree.loading ? (
        <Loading />
      ) : (
        <ScrollView style={{ flex: 1, backgroundColor: t.background }} contentContainerStyle={{ padding: 16 }} contentInsetAdjustmentBehavior="automatic">
          <Section header={`Sposta ${basename(path)}`}>
            {options.map((f) => {
              const depth = splitPath(f).length - 1;
              return (
                <Cell
                  key={f}
                  icon={<IconWell name="folderFill" color={t.folder} filled />}
                  title={depth === 0 ? `${projectLabel(f)}/` : `${'  '.repeat(depth - 1)}${basename(f)}/`}
                  mono
                  subtitle={f === from ? 'Posizione attuale' : depth === 0 ? 'Radice del progetto' : dirname(f)}
                  disabled={f === from}
                  titleColor={f === from ? t.textMuted : undefined}
                  onPress={() => moveTo(f)}
                />
              );
            })}
          </Section>
        </ScrollView>
      )}
    </>
  );
}
