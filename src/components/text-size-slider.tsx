import { Slider } from '@expo/ui/community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import { setTextScale, TEXT_SCALE_MAX, TEXT_SCALE_MIN, TEXT_SCALE_STEP, useTextScale } from '@/theme/text-size';

/** Reading size of notes: a small "A", a slider and a large "A". */
export function TextSizeSlider() {
  const t = useTheme();
  const scale = useTextScale();
  return (
    <View style={styles.row}>
      <Text style={{ color: t.textSecondary, fontSize: 13, fontWeight: '600' }}>A</Text>
      <Slider
        style={styles.slider}
        value={scale}
        minimumValue={TEXT_SCALE_MIN}
        maximumValue={TEXT_SCALE_MAX}
        step={TEXT_SCALE_STEP}
        minimumTrackTintColor={t.accent}
        onValueChange={setTextScale}
      />
      <Text style={{ color: t.textSecondary, fontSize: 22, fontWeight: '600' }}>A</Text>
      <Text style={[styles.value, { color: t.textMuted }]}>{Math.round(scale * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slider: { flex: 1, height: 36 },
  value: { width: 40, textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] },
});
