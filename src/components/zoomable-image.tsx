import { useEffect, useState } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * An image that fills the space it is given (fitted, like `contain`) and can be zoomed: pinch,
 * double tap to zoom in on a point (again to zoom out) and, once zoomed, drag to move around.
 * A single tap calls `onTap` (e.g. to hide the header).
 */
export function ZoomableImage({
  source,
  onTap,
  onError,
  onLoad,
  accessibilityLabel,
}: {
  source: ImageSourcePropType;
  onTap?: () => void;
  onError?: () => void;
  onLoad?: () => void;
  accessibilityLabel?: string;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [ratio, setRatio] = useState(1);
  const [zoomed, setZoomed] = useState(false);

  // The fitted image size at scale 1.
  const fitW = box.width && box.height ? Math.min(box.width, box.height * ratio) : 0;
  const fitH = ratio ? fitW / ratio : 0;

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ scale: 1, tx: 0, ty: 0 });
  const size = useSharedValue({ w: 0, h: 0, fitW: 0, fitH: 0 });
  useEffect(() => {
    size.value = { w: box.width, h: box.height, fitW, fitH };
  }, [size, box.width, box.height, fitW, fitH]);

  /** Keeps the image covering the screen: no empty margin can be dragged into view. */
  const clamp = (s: number, x: number, y: number) => {
    'worklet';
    const { w, h, fitW: iw, fitH: ih } = size.value;
    const maxX = Math.max(0, (iw * s - w) / 2);
    const maxY = Math.max(0, (ih * s - h) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  const settle = (s: number, x: number, y: number) => {
    'worklet';
    const target = Math.min(MAX_SCALE, Math.max(1, s));
    const c = clamp(target, x, y);
    scale.value = withTiming(target);
    tx.value = withTiming(c.x);
    ty.value = withTiming(c.y);
    scheduleOnRN(setZoomed, target > 1.01);
  };

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      start.value = { scale: scale.value, tx: tx.value, ty: ty.value };
    },
    onUpdate: (e) => {
      'worklet';
      const s0 = start.value.scale;
      // A little rubber band below 1 and above the maximum.
      const s = Math.min(MAX_SCALE * 1.3, Math.max(0.7, s0 * e.scale));
      // Keep the point between the fingers under the fingers.
      const fx = e.focalX - size.value.w / 2;
      const fy = e.focalY - size.value.h / 2;
      scale.value = s;
      tx.value = fx - (s / s0) * (fx - start.value.tx);
      ty.value = fy - (s / s0) * (fy - start.value.ty);
    },
    onDeactivate: () => {
      'worklet';
      settle(scale.value, tx.value, ty.value);
    },
  });

  const pan = usePanGesture({
    enabled: zoomed,
    // Two fingers are the pinch's: it moves the image itself, around the point between them.
    maxPointers: 1,
    onBegin: () => {
      'worklet';
      start.value = { scale: scale.value, tx: tx.value, ty: ty.value };
    },
    onUpdate: (e) => {
      'worklet';
      tx.value = start.value.tx + e.translationX;
      ty.value = start.value.ty + e.translationY;
    },
    onDeactivate: () => {
      'worklet';
      settle(scale.value, tx.value, ty.value);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet';
      if (scale.value > 1.01) return settle(1, 0, 0);
      const fx = e.x - size.value.w / 2;
      const fy = e.y - size.value.h / 2;
      settle(DOUBLE_TAP_SCALE, -fx * (DOUBLE_TAP_SCALE - 1), -fy * (DOUBLE_TAP_SCALE - 1));
    },
  });

  const singleTap = useTapGesture({
    onActivate: () => {
      'worklet';
      if (onTap) scheduleOnRN(onTap);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, useExclusiveGestures(doubleTap, singleTap));

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        <Animated.View style={[{ width: fitW, height: fitH }, animated]}>
          <Image
            source={source}
            resizeMode="contain"
            accessibilityLabel={accessibilityLabel}
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source;
              if (width && height) setRatio(width / height);
              onLoad?.();
            }}
            onError={onError}
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
