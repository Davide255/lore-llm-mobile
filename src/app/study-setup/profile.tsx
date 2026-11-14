import { useLocalSearchParams } from 'expo-router';

import { ProfileEditor } from '@/components/study/profile-editor';
import { studyDraft } from '@/data/study';

/** A5 inside the setup modal: a saved profile becomes the one chosen in A4. */
export default function SetupProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <ProfileEditor
      id={id || undefined}
      onSaved={(p) => {
        const d = studyDraft.get();
        if (d) studyDraft.set({ ...d, profileId: p.id });
      }}
    />
  );
}
