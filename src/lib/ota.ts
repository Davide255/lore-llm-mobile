import * as Updates from 'expo-updates';
import { AppState } from 'react-native';

import { showToast } from '@/components/toast';
import { createSignal } from '@/data/store';
import { formatOtaVersion } from '@/lib/ota-version';

/*
  Self-hosted live updates (see docs/OTA.md). Only the JS bundle and assets are
  replaced. Manifests are signed with the key held by the developer and
  expo-updates installs them only if the signature matches the certificate
  embedded in the app. A downloaded update is applied on the next cold start,
  never while the app is running. If it crashes at launch, expo-updates rolls
  back to the previous bundle by itself.
*/

const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 10 * 1000;

export type OtaPhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error';

export const otaPhase = createSignal<OtaPhase>('idle');

let checking = false;
let lastCheck = 0;
let notifiedUpdate: string | null = null; // "ready" is announced once per update and launch

/** Dev server and debug builds never touch the live-update bundles. */
export const otaEnabled = !__DEV__ && Updates.isEnabled;

/** Short label of the running bundle, e.g. "08/10 · 7c3fc46"; the store build when none was downloaded. */
export function currentOtaLabel(): string {
  if (Updates.isEmbeddedLaunch) return 'Versione dello store';
  const version = (Updates.manifest as { extra?: { otaVersion?: string } } | undefined)?.extra?.otaVersion;
  return version ? formatOtaVersion(version) : (Updates.updateId ?? 'Versione dello store');
}

export async function checkForOtaUpdate({ force = false }: { force?: boolean } = {}) {
  if (!otaEnabled || checking) return;
  if (!force && Date.now() - lastCheck < MIN_CHECK_INTERVAL_MS) return;

  checking = true;
  lastCheck = Date.now();
  otaPhase.set('checking');
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      otaPhase.set('current');
      return;
    }
    otaPhase.set('downloading');
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) {
      otaPhase.set('current');
      return;
    }
    otaPhase.set('ready');
    const id = fetched.manifest?.id ?? null;
    if (id !== notifiedUpdate) {
      notifiedUpdate = id;
      showToast({ icon: 'checkCircle', subject: 'Aggiornamento scaricato.', message: 'Si installerà al prossimo avvio.' });
    }
  } catch (e) {
    // Offline, server down, bad signature...: keep the current bundle.
    console.warn('[ota] update check failed', e);
    otaPhase.set('error');
  } finally {
    checking = false;
  }
}

/** Checks shortly after launch and whenever the app comes back to the foreground. */
export function startOtaUpdates() {
  if (!otaEnabled) return;
  setTimeout(() => void checkForOtaUpdate(), STARTUP_CHECK_DELAY_MS);
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void checkForOtaUpdate();
  });
}
