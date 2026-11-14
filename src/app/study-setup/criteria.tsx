import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { router, useNavigation } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Scale } from '@/api/study/types';
import { showActionSheet } from '@/components/action-sheet';
import { HeaderItems } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { CriteriaList } from '@/components/study/criteria-list';
import { SetupTitle } from '@/components/study/setup-header';
import { Cell, EmptyState, IconWell, Pill, Screen, Section, SectionHeader } from '@/components/ui';
import { savePreset, startSession, studyDraft, studyPresets, deletePreset } from '@/data/study';
import { routes } from '@/lib/routes';
import { addCriterion, effectiveMix, MAX_CRITERIA, rebalance, SCALE_LABELS, stepError, weightSum } from '@/lib/study-model';
import { useTheme } from '@/theme';

const SCALES: Scale[] = ['30', '10', 'percent', 'judgement'];

/**
 * A4 — Step 3 of 3: how to be graded. Free instructions on top, then the
 * weighted criteria (they apply to open answers and true/false motivations;
 * closed answers grade themselves), the scale, and presets kept on the device.
 */
export default function CriteriaScreen() {
  const t = useTheme();
  const draft = studyDraft.useValue();
  const presets = studyPresets.useValue();
  const navigation = useNavigation();
  const [naming, setNaming] = useState<string | null>(null);
  if (!draft) return <EmptyState icon="school" title="Nessuna sessione da preparare" />;

  const error = stepError(draft, 'criteria');
  const sum = Math.round(weightSum(draft.criteria));
  const open = effectiveMix(draft).open;

  const start = () => {
    startSession(draft);
    // Close the setup modal as a whole (its steps are a nested stack), then open the session:
    // closing the session later lands on the tab, not back on step 1.
    navigation.getParent()?.goBack();
    router.push(routes.studySession('generating'));
  };

  const confirmPreset = () => {
    const name = naming?.trim();
    if (!name) return;
    savePreset({ name, instructions: draft.instructions, criteria: draft.criteria, scale: draft.scale });
    studyDraft.set({ ...draft, presetName: name });
    setNaming(null);
  };

  return (
    <>
      <SetupTitle step={3} />
      <HeaderItems right={[{ kind: 'button', label: 'Inizia', variant: 'prominent', disabled: !!error, onPress: start }]} />
      <Screen keyboardShouldPersistTaps="handled">
        {presets.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 10 }}>
            {presets.map((p) => (
              <Pressable
                key={p.name}
                onLongPress={() =>
                  showActionSheet({ title: p.name, options: [{ label: 'Elimina preset', icon: 'delete', destructive: true, onPress: () => deletePreset(p.name) }] })
                }>
                <Pill
                  size="md"
                  active={draft.presetName === p.name}
                  onPress={() => studyDraft.set({ ...draft, instructions: p.instructions, criteria: p.criteria, scale: p.scale, presetName: p.name })}>
                  {p.name}
                </Pill>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <SectionHeader>Come vuoi essere valutato</SectionHeader>
        <TextInput
          value={draft.instructions}
          onChangeText={(instructions) => studyDraft.set({ ...draft, instructions, presetName: undefined })}
          placeholder="Es. Sii severo come all’orale di Analisi 1. Penalizza i teoremi enunciati senza ipotesi."
          placeholderTextColor={t.textMuted}
          multiline
          maxLength={2000}
          selectionColor={t.accentText}
          style={[styles.instructions, { backgroundColor: t.cell, color: t.text }]}
        />

        <View style={styles.criteriaHeader}>
          <SectionHeader style={{ flex: 1 }}>Criteri · peso</SectionHeader>
          {draft.criteria.length && sum !== 100 ? (
            <Pressable onPress={() => studyDraft.set({ ...draft, criteria: rebalance(draft.criteria) })} hitSlop={8} style={{ marginTop: 11 }}>
              <Text style={{ color: t.accentText, fontSize: 13, fontWeight: '600' }}>Riporta a 100%</Text>
            </Pressable>
          ) : null}
        </View>
        {draft.criteria.length ? (
          <CriteriaList criteria={draft.criteria} onChange={(criteria) => studyDraft.set({ ...draft, criteria, presetName: undefined })} />
        ) : null}
        {draft.criteria.length < MAX_CRITERIA ? (
          <Section inset={13} style={{ marginTop: 8 }}>
            <Cell
              icon={<IconWell name="add" />}
              title="Aggiungi criterio"
              titleColor={t.accentText}
              onPress={() => studyDraft.set({ ...draft, criteria: addCriterion(draft.criteria, 'Nuovo criterio'), presetName: undefined })}
            />
          </Section>
        ) : null}
        <Text style={[styles.note, { color: error ? t.errorText : t.textMuted }]}>
          {error ??
            (open
              ? `Pesi: ${sum}%. Le domande chiuse si correggono da sole; i criteri pesano sulle aperte e sulle motivazioni dei vero o falso.`
              : 'Senza domande aperte i criteri contano solo per le motivazioni dei vero o falso.')}
        </Text>

        <SectionHeader>Scala del voto</SectionHeader>
        <SegmentedControl
          values={SCALES.map((s) => SCALE_LABELS[s])}
          selectedIndex={SCALES.indexOf(draft.scale)}
          onValueChange={(label) => studyDraft.set({ ...draft, scale: SCALES.find((s) => SCALE_LABELS[s] === label)!, presetName: undefined })}
          appearance={t.scheme}
          tintColor={t.accent}
        />

        {naming === null ? (
          <Pressable onPress={() => setNaming(draft.presetName ?? '')} style={styles.presetLink} accessibilityRole="button">
            <Icon name="bookmark" size={16} color={t.accentText} />
            <Text style={{ color: t.accentText, fontSize: 15 }}>
              {draft.presetName ? `Preset «${draft.presetName}»` : 'Salva come preset'}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.presetRow, { backgroundColor: t.cell }]}>
            <TextInput
              value={naming}
              onChangeText={setNaming}
              placeholder="Nome del preset, es. Orale Analisi"
              placeholderTextColor={t.textMuted}
              autoFocus
              maxLength={60}
              onSubmitEditing={confirmPreset}
              selectionColor={t.accentText}
              style={{ flex: 1, color: t.text, fontSize: 15.5, paddingVertical: 10 }}
            />
            <Pressable onPress={confirmPreset} hitSlop={8} disabled={!naming.trim()}>
              <Text style={{ color: naming.trim() ? t.accentText : t.textMuted, fontWeight: '600', fontSize: 15 }}>Salva</Text>
            </Pressable>
          </View>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  instructions: { borderRadius: 14, padding: 13, minHeight: 84, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  criteriaHeader: { flexDirection: 'row', alignItems: 'center' },
  note: { fontSize: 12, lineHeight: 16, marginTop: 8, marginHorizontal: 6 },
  presetLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 22, paddingVertical: 8 },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 13, marginTop: 22 },
});
