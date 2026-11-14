import { useLocalSearchParams } from 'expo-router';

import { NotePicker } from '@/components/study/note-picker';

/** A2 — Step 1 of 3, inside a subfolder of the project (pushed from the root). */
export default function ChooseNotesFolderScreen() {
  const { dir } = useLocalSearchParams<{ dir: string }>();
  return <NotePicker dir={dir || null} />;
}
