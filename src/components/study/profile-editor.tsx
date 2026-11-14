import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { showActionSheet } from '@/components/action-sheet';
import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { PROFILE_GLYPHS, ProfileAvatar, SmallStepper } from '@/components/study/profile-parts';
import { SectionHeader, Screen } from '@/components/ui';
import { deleteProfile, saveProfile, studyProfiles } from '@/data/study';
import { haptic } from '@/lib/haptics';
import { gradingFromInstructions, addCriterion, DEFAULT_CRITERIA, MAX_CRITERIA, newProfileId, PROFILE_ICONS, profileError, rebalance, weightSum, type StudyProfile } from '@/lib/study-model';
import { brand, useTheme } from '@/theme';


/**
 * A5 — A grading profile: name and icon, how it grades in free words, what
 * counts (weights summing to 100), the scale and when the correction comes.
 * Kept on this device. `id` absent: a new profile. `onSaved` gets the saved one.
 */
export function ProfileEditor({ id, onSaved }: { id?: string; onSaved?: (p: StudyProfile) => void }) {
  const t = useTheme();
  const profiles = studyProfiles.useValue();
  const existing = id ? profiles.find((p) => p.id === id) : undefined;
  const [p, setP] = useState<StudyProfile>(
    () =>
      existing ?? {
        id: '',
        name: '',
        icon: 'school',
        instructions: '',
        criteria: DEFAULT_CRITERIA.map((c) => ({ ...c })),
        scale: '30',
        correctionAtEnd: true,
      },
  );
  const error = profileError(p);
  // Scale and correction mode are read from the instructions, in the user's words.
  const inferred = gradingFromInstructions(p.instructions);
  const sum = Math.round(weightSum(p.criteria));
  const patch = (x: Partial<StudyProfile>) => setP((cur) => ({ ...cur, ...x }));
  const setCriterion = (i: number, x: Partial<StudyProfile['criteria'][number]>) => patch({ criteria: p.criteria.map((c, j) => (j === i ? { ...c, ...x } : c)) });

  const save = () => {
    if (error) return haptic.warn();
    haptic.success();
    const saved = { ...p, ...inferred, name: p.name.trim(), instructions: p.instructions.trim(), id: p.id || newProfileId(profiles, p.name) };
    saveProfile(saved);
    onSaved?.(saved);
    router.back();
  };

  const remove = () =>
    Alert.alert(`Eliminare “${p.name}”?`, 'Le sessioni già fatte e i loro report restano.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          deleteProfile(p.id);
          router.back();
        },
      },
    ]);

  const pickIcon = () =>
    showActionSheet({
      title: 'Icona del profilo',
      options: PROFILE_ICONS.map((icon) => ({
        label: PROFILE_GLYPHS[icon].label,
        icon: PROFILE_GLYPHS[icon].icon,
        onPress: () => {
          haptic.select();
          patch({ icon });
        },
      })),
    });

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Profilo' : 'Nuovo profilo' }} />
      <HeaderItems right={[{ kind: 'button', label: 'Salva', variant: 'prominent', disabled: !!error, onPress: save }]} />
      <Screen keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable onPress={pickIcon} accessibilityRole="button" accessibilityLabel="Cambia icona">
            <Animated.View key={p.icon} entering={FadeIn.duration(220)}>
              <ProfileAvatar icon={p.icon} size={54} strong />
            </Animated.View>
            <View style={[styles.editBadge, { backgroundColor: t.sheet, borderColor: t.background }]}>
              <Icon name="edit" size={11} color={t.text} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: t.textSecondary }]}>Nome</Text>
            <TextInput
              value={p.name}
              onChangeText={(name) => patch({ name })}
              placeholder="Es. Orale Analisi"
              placeholderTextColor={t.textMuted}
              maxLength={40}
              autoFocus={!existing}
              selectionColor={t.accentText}
              style={[styles.name, { backgroundColor: t.cell, color: t.text }]}
            />
          </View>
        </View>

        <SectionHeader>Come ti valuta</SectionHeader>
        <TextInput
          value={p.instructions}
          onChangeText={(instructions) => patch({ instructions })}
          placeholder="Es. Severo come all’orale di Analisi 1. Penalizza i teoremi senza ipotesi. Voto in trentesimi, correggi alla fine."
          placeholderTextColor={t.textMuted}
          multiline
          maxLength={2000}
          selectionColor={t.accentText}
          style={[styles.instructions, { backgroundColor: t.cell, color: t.text }]}
        />
        <Text style={[styles.note, { color: t.textMuted }]}>
          Scrivi qui anche il voto («in trentesimi», «/10», «in percentuale», «a giudizio») e quando correggere («alla fine» o «dopo ogni domanda»).
        </Text>

        <View style={styles.critHeader}>
          <SectionHeader style={{ flex: 1 }}>Cosa conta</SectionHeader>
          {p.criteria.length && sum !== 100 ? (
            <Pressable
              onPress={() => {
                haptic.select();
                patch({ criteria: rebalance(p.criteria) });
              }} hitSlop={8} style={{ marginTop: 11 }} accessibilityRole="button">
              <Text style={{ color: t.accentText, fontSize: 13, fontWeight: '600' }}>Riporta a 100%</Text>
            </Pressable>
          ) : (
            <Text style={{ color: t.textSecondary, fontSize: 12.5, marginTop: 11, marginRight: 6 }}>totale {sum}%</Text>
          )}
        </View>
        <View style={[styles.group, { backgroundColor: t.cell }]}>
          {p.criteria.map((c, i) => (
            <Animated.View
              key={c.id}
              entering={FadeInDown.duration(240)}
              exiting={FadeOut.duration(160)}
              layout={LinearTransition.duration(220)}
              style={[styles.crit, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={c.name}
                  onChangeText={(name) => setCriterion(i, { name })}
                  placeholder="Nome del criterio"
                  placeholderTextColor={t.textMuted}
                  maxLength={60}
                  selectionColor={t.accentText}
                  style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '500', paddingVertical: 4 }}
                />
                <SmallStepper value={c.weight} onChange={(weight) => setCriterion(i, { weight })} />
                <Pressable
                  onPress={() => {
                    haptic.light();
                    patch({ criteria: p.criteria.filter((_, j) => j !== i) });
                  }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Elimina ${c.name}`}>
                  <Icon name="cancelCircle" size={18} color={t.textMuted} />
                </Pressable>
              </View>
              <AnimatedBar value={c.weight / 100} />
            </Animated.View>
          ))}
          {p.criteria.length < MAX_CRITERIA ? (
            <Animated.View layout={LinearTransition.duration(220)} style={p.criteria.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline }}>
              <Pressable
                onPress={() => {
                  haptic.light();
                  patch({ criteria: addCriterion(p.criteria, 'Nuovo criterio') });
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.addRow, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
                <Icon name="add" size={18} color={t.accentText} />
                <Text style={{ color: t.accentText, fontSize: 15.5 }}>Aggiungi criterio</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
        <Text style={[styles.note, { color: error ? t.errorText : t.textMuted }]}>
          {error ?? 'Le domande chiuse si correggono da sole: i criteri pesano sulle risposte aperte e sulle motivazioni dei vero o falso.'}
        </Text>

        {existing && profiles.length > 1 ? (
          <Pressable onPress={remove} style={{ alignSelf: 'center', padding: 12, marginTop: 24 }} accessibilityRole="button">
            <Text style={{ color: t.error, fontSize: 15 }}>Elimina profilo</Text>
          </Pressable>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 12 },
  editBadge: { position: 'absolute', right: -2, bottom: -2, width: 21, height: 21, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 6, marginLeft: 2 },
  name: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, fontWeight: '600' },
  instructions: { borderRadius: 14, padding: 13, minHeight: 76, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  critHeader: { flexDirection: 'row', alignItems: 'center' },
  group: { borderRadius: 16, overflow: 'hidden', borderCurve: 'continuous' },
  crit: { paddingHorizontal: 13, paddingVertical: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 13 },
  note: { fontSize: 12, lineHeight: 16, marginTop: 8, marginHorizontal: 6 },
});

/** A weight bar that glides to its new length. */
function AnimatedBar({ value }: { value: number }) {
  const t = useTheme();
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, overflow: 'hidden', marginTop: 8 }}>
      <Animated.View
        layout={LinearTransition.duration(220)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', borderRadius: 2, backgroundColor: brand.purple, experimental_backgroundImage: brand.gradient }}
      />
    </View>
  );
}
