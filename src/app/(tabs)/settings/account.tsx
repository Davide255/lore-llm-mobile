import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';

import { authUser, providerLabels, signOut } from '@/auth/session';
import { AgentAvatar, initialsOf } from '@/components/identity';
import { Cell, IconWell, Screen, Section } from '@/components/ui';
import { actions, attempt } from '@/data/hooks';
import { useTheme } from '@/theme';

/** Settings → Account: who is signed in, sign out, delete the account. */
export default function AccountSettingsScreen() {
  const t = useTheme();
  const user = authUser.useValue();
  const [deleting, setDeleting] = useState(false);

  const confirmSignOut = () =>
    Alert.alert('Uscire?', 'La knowledge base resta sul server: ritrovi tutto accedendo di nuovo.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: () => signOut() },
    ]);

  const deleteAccount = async () => {
    setDeleting(true);
    const done = await attempt(() => actions.deleteAccount().then(() => true), 'Account non eliminato');
    setDeleting(false);
    if (done) await signOut();
  };

  // Two steps, the second one naming what goes away: there is no way back.
  const confirmDeleteAccount = () =>
    Alert.alert(
      'Eliminare l’account?',
      'Verranno cancellati per sempre i tuoi progetti e file, gli agenti collegati, le tue iscrizioni ai team e l’accesso con Google o Apple. Non si può annullare.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Continua',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Ultima conferma', 'Eliminare definitivamente l’account e tutti i suoi dati?', [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Elimina account', style: 'destructive', onPress: deleteAccount },
            ]),
        },
      ],
    );

  return (
    <>
      <Stack.Screen options={{ title: 'Account', headerLargeTitle: false }} />
      <Screen contentContainerStyle={{ paddingTop: 8 }}>
        {user && (
          <Section>
            <Cell
              icon={<AgentAvatar label={initialsOf(user.name)} round />}
              title={user.name}
              strong
              subtitle={user.email ? `${user.email} · ${providerLabels[user.provider]}` : `Account ${providerLabels[user.provider]}`}
            />
          </Section>
        )}

        <Section header="Sessione">
          <Cell icon={<IconWell name="logout" />} title="Esci" titleColor={t.error} onPress={confirmSignOut} />
        </Section>

        <Section header="Zona pericolosa" footer="Cancella per sempre account, progetti, file e agenti collegati.">
          <Cell
            icon={<IconWell name="delete" />}
            title="Elimina account"
            titleColor={t.error}
            right={deleting ? <ActivityIndicator color={t.textMuted} /> : undefined}
            disabled={deleting}
            onPress={confirmDeleteAccount}
          />
        </Section>
      </Screen>
    </>
  );
}
