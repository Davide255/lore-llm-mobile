import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Entry, Project } from '@/api';
import { showActionSheet } from './action-sheet';
import { entryMenu } from './entry-actions';
import { Icon, projectIcons } from './icon';
import { IconWell, Pill, ProgressBar } from './ui';
import { actions, attempt } from '@/data/hooks';
import { relativeTime } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useTheme } from '@/theme';

const GAP = 16;

/** Cards per row for a grid this wide, as on the desktop app. */
const columnsFor = (width: number) => (width > 900 ? 3 : 2);

/** Tablet projects grid (Lore LLM Desktop's): one card per project, then a "new project" card. */
export function ProjectGrid({ projects, starred }: { projects: Project[]; starred: ReadonlySet<string> }) {
  const [width, setWidth] = useState(0);
  const cols = columnsFor(width);
  const cardWidth = width ? (width - GAP * (cols - 1)) / cols : 0;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.grid}>
      {cardWidth > 0 && (
        <>
          {projects.map((p) => (
            <View key={p.name} style={{ width: cardWidth }}>
              <ProjectCard project={p} starred={starred.has(p.name)} />
            </View>
          ))}
          <View style={{ width: cardWidth }}>
            <NewProjectCard />
          </View>
        </>
      )}
    </View>
  );
}

function ProjectCard({ project: p, starred }: { project: Project; starred: boolean }) {
  const t = useTheme();
  const entry: Entry = { kind: 'folder', path: p.name, name: p.title, access: p.access, fileCount: p.fileCount, folderCount: 0, updatedAt: p.updatedAt };
  const menu = () => showActionSheet({ title: p.title, options: entryMenu(entry, starred) });
  const well = p.icon === 'web' ? { background: t.folderWell, color: t.folder } : { background: t.accentWell, color: t.accentText };
  return (
    <Pressable
      onPress={() => router.push(routes.folder(p.name))}
      onLongPress={menu}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? t.cellRaised : t.cell, borderColor: pressed ? t.highlight : t.hairline }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <IconWell name={projectIcons[p.icon]} size={36} {...well} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.22, color: t.text }}>
            {p.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {p.team ? (
              <View>
                <Pill>{p.team.name}</Pill>
              </View>
            ) : null}
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, color: t.textMuted }}>
              {p.fileCount} file · {relativeTime(p.updatedAt)}
              {p.access === 'viewer' ? ' · sola lettura' : ''}
            </Text>
          </View>
        </View>
        <CardButton
          label={starred ? `Rimuovi ${p.title} dai preferiti` : `Aggiungi ${p.title} ai preferiti`}
          onPress={() => attempt(() => actions.setStar(p.name, !starred), 'Impossibile aggiornare i preferiti')}>
          <Icon name={starred ? 'starFill' : 'star'} size={18} color={starred ? t.warning : t.textMuted} />
        </CardButton>
        <CardButton label="Altro" onPress={menu}>
          <Icon name="more" size={18} color={t.textMuted} />
        </CardButton>
      </View>
      <Text numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 20, color: p.description ? t.textSecondary : t.textMuted }}>
        {p.description || 'Nessuna descrizione.'}
      </Text>
      <View style={{ flex: 1 }} />
      {p.checklist?.total ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <ProgressBar value={p.checklist.done / p.checklist.total} style={{ flex: 1 }} />
          <Text style={{ fontSize: 11.5, fontWeight: '600', color: t.textMuted }}>
            {p.checklist.done}/{p.checklist.total}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: t.textMuted }}>Nessuna checklist</Text>
      )}
    </Pressable>
  );
}

function CardButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.cardButton, { backgroundColor: pressed ? t.fill : 'transparent' }]}>
      {children}
    </Pressable>
  );
}

function NewProjectCard() {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push(routes.newProject())}
      accessibilityRole="button"
      style={({ pressed }) => [styles.newCard, { borderColor: pressed ? t.highlight : t.hairline }]}>
      <Icon name="add" size={19} color={t.textMuted} />
      <Text style={{ fontSize: 14.5, fontWeight: '500', color: t.textMuted }}>Nuovo progetto</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 8 },
  card: { gap: 12, padding: 18, minHeight: 150, flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderCurve: 'continuous' },
  cardButton: { padding: 4, borderRadius: 8 },
  newCard: {
    minHeight: 150,
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
