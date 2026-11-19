import { useLocalSearchParams } from 'expo-router';

import { FolderPicker } from '@/components/folder-picker';
import { routes } from '@/lib/routes';

/** C2.1 — «Posizione»: one folder of the project, pushed from the form or from its parent folder. */
export default function NewFileFolderScreen() {
  const { dir, current } = useLocalSearchParams<{ dir: string; current: string }>();
  return <FolderPicker dir={dir} current={current} href={(d) => routes.newFileFolder(d, current)} />;
}
