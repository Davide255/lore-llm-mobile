import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import type { Criterion } from '@/api/study/types';
import { Icon } from '@/components/icon';
import { Stepper } from '@/components/study/parts';
import { moveItem } from '@/lib/study-model';
import { useTheme } from '@/theme';

const ROW_H = 74;

/**
 * A4's criteria: name, description and weight in place, reordered by dragging
 * the handle. Rows have a fixed height, so the target slot is just the drag
 * distance over the row height; the others slide aside while dragging.
 */
export function CriteriaList({ criteria, onChange }: { criteria: Criterion[]; onChange: (c: Criterion[]) => void }) {
  const t = useTheme();
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const target = drag ? Math.max(0, Math.min(criteria.length - 1, drag.from + Math.round(drag.dy / ROW_H))) : -1;

  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < target && i > drag.from && i <= target) return -ROW_H;
    if (drag.from > target && i < drag.from && i >= target) return ROW_H;
    return 0;
  };

  const patch = (i: number, p: Partial<Criterion>) => onChange(criteria.map((c, j) => (j === i ? { ...c, ...p } : c)));

  return (
    <View style={[styles.group, { backgroundColor: t.cell }]}>
      {criteria.map((c, i) => (
        <Row
          key={c.id}
          criterion={c}
          first={i === 0}
          offset={drag?.from === i ? drag.dy : shift(i)}
          dragging={drag?.from === i}
          onDrag={(dy) => setDrag({ from: i, dy })}
          onDrop={() => {
            if (drag && target !== drag.from) onChange(moveItem(criteria, drag.from, target));
            setDrag(null);
          }}
          onPatch={(p) => patch(i, p)}
          onRemove={() => onChange(criteria.filter((_, j) => j !== i))}
        />
      ))}
    </View>
  );
}

function Row({
  criterion: c,
  first,
  offset,
  dragging,
  onDrag,
  onDrop,
  onPatch,
  onRemove,
}: {
  criterion: Criterion;
  first: boolean;
  offset: number;
  dragging: boolean;
  onDrag: (dy: number) => void;
  onDrop: () => void;
  onPatch: (p: Partial<Criterion>) => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 2,
    onUpdate: (e) => onDrag(e.translationY),
    onFinalize: () => onDrop(),
  });
  return (
    <View
      style={[
        styles.row,
        {
          transform: [{ translateY: offset }],
          zIndex: dragging ? 2 : 0,
          backgroundColor: dragging ? t.cellRaised : t.cell,
          borderTopColor: first || dragging ? 'transparent' : t.hairline,
          boxShadow: dragging ? '0 8px 20px rgba(0,0,0,0.35)' : undefined,
        },
      ]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <TextInput
          value={c.name}
          onChangeText={(name) => onPatch({ name })}
          placeholder="Nome del criterio"
          placeholderTextColor={t.textMuted}
          maxLength={60}
          selectionColor={t.accentText}
          style={[styles.name, { color: t.text }]}
        />
        <TextInput
          value={c.description}
          onChangeText={(description) => onPatch({ description })}
          placeholder="Cosa conta (facoltativo)"
          placeholderTextColor={t.textMuted}
          maxLength={200}
          selectionColor={t.accentText}
          style={[styles.desc, { color: t.textSecondary }]}
        />
      </View>
      <Stepper value={c.weight} max={100} step={5} suffix="%" onChange={(weight) => onPatch({ weight })} />
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Elimina ${c.name}`}>
        <Icon name="cancelCircle" size={18} color={t.textMuted} />
      </Pressable>
      <GestureDetector gesture={pan}>
        <View style={styles.handle} accessibilityLabel="Trascina per riordinare">
          <Icon name="drag" size={18} color={t.textMuted} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 16, borderCurve: 'continuous' },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 13, paddingRight: 4, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  name: { fontSize: 15.5, fontWeight: '500', paddingVertical: 2 },
  desc: { fontSize: 12.5, paddingVertical: 2 },
  handle: { width: 34, height: ROW_H, alignItems: 'center', justifyContent: 'center' },
});
