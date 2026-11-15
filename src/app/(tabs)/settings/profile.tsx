import { useLocalSearchParams } from 'expo-router';

import { ProfileEditor } from '@/components/study/profile-editor';

/** A5 from Settings › Profili di valutazione. */
export default function SettingsProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ProfileEditor id={id || undefined} />;
}
