import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

import { showActionSheet } from '@/components/action-sheet';
import { HeaderItems } from '@/components/header-items';
import { ProfileAvatar } from '@/components/study/profile-parts';
import { Banner, Cell, Screen, Section } from '@/components/ui';
import { deleteProfile, loadStudyPrefs, saveProfile, studyProfiles } from '@/data/study';
import { routes } from '@/lib/routes';
import { MAX_PROFILES, newProfileId, profileSubtitle } from '@/lib/study-model';

/** Settings › Profili di valutazione: the grading profiles of the Studio, kept on this device. */
export default function ProfilesScreen() {
  const profiles = studyProfiles.useValue();
  useEffect(() => {
    loadStudyPrefs();
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Profili di valutazione', headerLargeTitle: false }} />
      {profiles.length < MAX_PROFILES ? (
        <HeaderItems right={[{ kind: 'button', label: 'Nuovo profilo', icon: 'add', onPress: () => router.push(routes.studyProfile()) }]} />
      ) : null}
      <Screen>
        <Section header={`${profiles.length} ${profiles.length === 1 ? 'profilo' : 'profili'}`} inset={63}>
          {profiles.map((p) => (
            <Cell
              key={p.id}
              icon={<ProfileAvatar icon={p.icon} size={38} />}
              title={p.name}
              strong
              subtitle={`${profileSubtitle(p)} · ${p.criteria.length} ${p.criteria.length === 1 ? 'criterio' : 'criteri'}`}
              chevron
              onPress={() => router.push(routes.studyProfile(p.id))}
              onLongPress={() =>
                showActionSheet({
                  title: p.name,
                  options: [
                    ...(profiles.length < MAX_PROFILES
                      ? [{ label: 'Duplica', icon: 'duplicate' as const, onPress: () => saveProfile({ ...p, id: newProfileId(profiles, p.name), name: `${p.name} (copia)` }) }]
                      : []),
                    ...(profiles.length > 1 ? [{ label: 'Elimina', icon: 'delete' as const, destructive: true, onPress: () => deleteProfile(p.id) }] : []),
                  ],
                })
              }
            />
          ))}
        </Section>
        <Banner icon="info" tone="neutral" style={{ marginTop: 18 }}>
          Un profilo dice all’AI come valutarti: istruzioni, criteri pesati, scala del voto e quando correggere. Si sceglie all’ultimo passo di ogni sessione. Per ora i profili restano su questo dispositivo.
        </Banner>
      </Screen>
    </>
  );
}
