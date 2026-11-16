import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Dimensions, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * Hides the native header while the user scrolls down and brings it back on scrolling up (or at
 * the top), like a reader app. Returns an `onScroll` for a ScrollView or WebView.
 */
export function useAutoHideHeader() {
  const navigation = useNavigation();
  const shown = useRef(true);
  const last = useRef(0);
  const anchor = useRef(0);
  const heading = useRef(0);

  const setShown = useCallback(
    (next: boolean) => {
      if (shown.current === next) return;
      shown.current = next;
      navigation.setOptions({ headerShown: next });
    },
    [navigation],
  );

  // Leave the header visible if the screen unmounts while it is hidden.
  useEffect(() => () => navigation.setOptions({ headerShown: true }), [navigation]);

  return useCallback(
    (e: NativeSyntheticEvent<Pick<NativeScrollEvent, 'contentOffset'>>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dir = Math.sign(y - last.current);
      last.current = y;
      if (y <= 8) return setShown(true);
      if (dir === 0) return;
      // A change of direction restarts the measurement, so a small wobble doesn't flip the bar.
      if (dir !== heading.current) {
        heading.current = dir;
        anchor.current = y;
      }
      if (dir > 0 && y - anchor.current > 24) setShown(false);
      else if (dir < 0 && anchor.current - y > 24) setShown(true);
    },
    [setShown],
  );
}

/**
 * Full reading mode: a tap in the middle of the screen hides the native header, the next one
 * brings it back. Returns an `onPress` for a Pressable wrapping the content; links, tasks and
 * images inside keep their own taps (the innermost touchable wins), and scrolling cancels it.
 */
export function useTapToggleHeader() {
  const navigation = useNavigation();
  const shown = useRef(true);

  // Leave the header visible if the screen unmounts while it is hidden.
  useEffect(() => () => navigation.setOptions({ headerShown: true }), [navigation]);

  return useCallback(
    (e: GestureResponderEvent) => {
      // Only the middle band: the edges are where the bar and the home indicator live.
      const { height } = Dimensions.get('window');
      const y = e.nativeEvent.pageY;
      if (y < height * 0.2 || y > height * 0.8) return;
      shown.current = !shown.current;
      navigation.setOptions({ headerShown: shown.current });
    },
    [navigation],
  );
}
