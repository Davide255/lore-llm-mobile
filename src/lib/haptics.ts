import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Touch feedback for the study screens; silent on web and where the device has none. */
const on = Platform.OS !== 'web';

export const haptic = {
  /** A value changed: a stepper tick, a card picked, a switch flipped. */
  select: () => on && void Haptics.selectionAsync().catch(() => {}),
  /** A primary action: start, next, hand in. */
  tap: () => on && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  light: () => on && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  /** Something saved or confirmed. */
  success: () => on && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  /** A limit was hit (stepper at its min/max) or something can't be done. */
  warn: () => on && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
