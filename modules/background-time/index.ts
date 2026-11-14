import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/**
 * Extra running time after the app goes to the background (iOS: about 30 s,
 * via UIApplication.beginBackgroundTask). A no-op elsewhere and in builds
 * without the native module (Expo Go, an older binary).
 */
interface NativeModule {
  begin(key: string): void;
  end(key: string): void;
  addListener(event: 'onExpire', listener: (e: { key: string }) => void): EventSubscription;
}

const native = requireOptionalNativeModule<NativeModule>('BackgroundTime');

export const BackgroundTime = {
  isAvailable: native != null,
  /** Starts asking for background time under `key` (calling it again is harmless). */
  begin: (key: string) => native?.begin(key),
  /** The work under `key` is over: give the time back. */
  end: (key: string) => native?.end(key),
  /** iOS ran out of time for `key`; the work is about to be frozen. */
  onExpire: (listener: (key: string) => void) => native?.addListener('onExpire', (e) => listener(e.key)) ?? { remove() {} },
};
