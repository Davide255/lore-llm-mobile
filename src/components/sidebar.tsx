import { router, usePathname, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Entry, Project } from '@/api';
import { authUser } from '@/auth/session';
import { showActionSheet } from './action-sheet';
import { entryMenu } from './entry-actions';
import { Icon, projectIcons, type IconName } from './icon';
import { AgentAvatar, initialsOf } from './identity';
import { Pill } from './ui';
import { useActivity, useAgents, useFolder, useProjects, useStars } from '@/data/hooks';
import { relativeTime } from '@/lib/format';
import { routes } from '@/lib/routes';
import { sortEntries } from '@/lib/sort';
import { ancestors, sidebarSelection, type SidebarSection } from '@/lib/split';
import { attachmentKind } from '@/lib/upload-plan';
import { brand, fonts, useTheme } from '@/theme';
import { SIDEBAR_WIDTH, sidebarOpen } from '@/theme/layout';
import { useSortOrder } from '@/theme/sort-order';

const SECTION_HREF: Record<SidebarSection, Href> = {
  projects: '/',
  activity: '/activity',
  settings: '/settings',
};

/** A section of the app: back to the tabs, then to that tab. */
function openSection(section: SidebarSection) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(SECTION_HREF[section]);
}

/** Global search lives in the Projects screen's bar: open it, focused. */
function openSearch() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate({ pathname: '/', params: { search: '1' } });
}

/** A file or folder picked in the tree takes the place of what the content pane shows. */
function openEntry(href: Href) {
  if (router.canDismiss()) router.replace(href);
  else router.push(href);
}

/**
 * The tablet sidebar, after Lore LLM Desktop's: search, the app's sections,
 * the project tree, the account and the connected agents. Sized for touch.
 */
export function Sidebar() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { section, path } = sidebarSelection(pathname);
  const projects = useProjects();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  // Whatever the content pane shows is revealed in the tree (state adjusted while rendering, not in an effect).
  const [revealed, setRevealed] = useState<string | null>(null);
  if (path !== revealed) {
    setRevealed(path);
    const wanted = path ? ancestors(path).filter((p) => !expanded.has(p)) : [];
    if (wanted.length) setExpanded(new Set([...expanded, ...wanted]));
  }

  const toggle = (p: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(p)) next.add(p);
      else next.delete(p);
      return next;
    });

  const tree: TreeProps = { expanded, toggle, selected: path };

  return (
    <View
      style={[
        styles.root,
        { width: SIDEBAR_WIDTH, backgroundColor: t.sidebar, borderColor: t.hairline, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10, paddingLeft: insets.left + 10 },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={openSearch}
          accessibilityRole="search"
          style={({ pressed }) => [styles.search, { flex: 1, backgroundColor: pressed ? t.fill : t.fillSubtle }]}>
          <Icon name="search" size={17} color={t.textMuted} />
          <Text style={{ flex: 1, fontSize: 15, color: t.textMuted }}>Cerca</Text>
        </Pressable>
        <Pressable
          onPress={() => sidebarOpen.set(false)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Nascondi la barra laterale"
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.fill : 'transparent' })}>
          <Icon name="sidebar" size={20} color={t.textSecondary} />
        </Pressable>
      </View>

      <View style={{ gap: 2, marginTop: 10 }}>
        <NavItem icon="folder" activeIcon="folderFill" label="Progetti" active={section === 'projects' && !path} onPress={() => openSection('projects')} />
        <NavItem icon="bolt" activeIcon="boltFill" label="Attività" active={section === 'activity'} onPress={() => openSection('activity')} />
        <NavItem icon="settings" activeIcon="settingsFill" label="Impostazioni" active={section === 'settings'} onPress={() => openSection('settings')} />
      </View>

      <View style={styles.label}>
        <Text style={[styles.labelText, { color: t.textMuted }]}>Progetti</Text>
        <Pressable onPress={() => router.push(routes.newProject())} hitSlop={10} accessibilityRole="button" accessibilityLabel="Nuovo progetto">
          <Icon name="add" size={18} color={t.textMuted} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1, marginHorizontal: -4 }} contentContainerStyle={{ gap: 1, paddingHorizontal: 4, paddingBottom: 12 }}>
        {projects.loading ? (
          <ActivityIndicator color={t.textMuted} style={{ marginTop: 12 }} />
        ) : projects.data?.length ? (
          projects.data.map((p) => <ProjectRow key={p.name} project={p} {...tree} />)
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 19, color: t.textMuted, paddingHorizontal: 10, paddingTop: 4 }}>
            {projects.error ? 'Impossibile caricare i progetti.' : 'Nessun progetto. Premi + per crearne uno.'}
          </Text>
        )}
      </ScrollView>

      <AccountRow />
      <AgentsFooter />
    </View>
  );
}

function NavItem({ icon, activeIcon, label, active, onPress }: { icon: IconName; activeIcon: IconName; label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.nav, { backgroundColor: active ? t.accentSoft : pressed ? t.fillSubtle : 'transparent' }]}>
      <Icon name={active ? activeIcon : icon} size={19} color={active ? t.accentText : t.textSecondary} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: active ? t.text : t.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

// ─── Tree ────────────────────────────────────────────────────────────────────

interface TreeProps {
  expanded: ReadonlySet<string>;
  toggle: (path: string, open?: boolean) => void;
  selected: string | null;
}

const INDENT = 16;

function ProjectRow({ project: p, ...tree }: { project: Project } & TreeProps) {
  const t = useTheme();
  const stars = useStars();
  const open = tree.expanded.has(p.name);
  const entry: Entry = { kind: 'folder', path: p.name, name: p.title, access: p.access, fileCount: p.fileCount, folderCount: 0, updatedAt: p.updatedAt };
  return (
    <>
      <Row
        depth={0}
        folder
        open={open}
        current={tree.selected === p.name}
        icon={<Icon name={projectIcons[p.icon]} size={17} color={p.icon === 'web' ? t.folder : t.accentText} />}
        label={p.title}
        strong={open}
        trailing={
          <>
            {p.team ? (
              <View>
                <Pill>{p.team.name}</Pill>
              </View>
            ) : null}
            <Text style={[styles.count, { color: t.textMuted }]}>{p.fileCount}</Text>
          </>
        }
        onToggle={() => tree.toggle(p.name)}
        onPress={() => {
          tree.toggle(p.name, true);
          openEntry(routes.folder(p.name));
        }}
        onLongPress={() => showActionSheet({ title: p.title, options: entryMenu(entry, !!stars.data?.some((s) => s.path === p.name)) })}
      />
      {open ? <FolderChildren path={p.name} depth={1} {...tree} /> : null}
    </>
  );
}

function FolderChildren({ path, depth, ...tree }: { path: string; depth: number } & TreeProps) {
  const t = useTheme();
  const folder = useFolder(path);
  const sortOrder = useSortOrder();
  const d = folder.data;
  if (!d) {
    return (
      <View style={[styles.row, { paddingLeft: 8 + depth * INDENT + 22 }]}>
        {folder.loading ? <ActivityIndicator size="small" color={t.textMuted} /> : null}
        <Text style={{ fontSize: 13, color: t.textMuted }}>{folder.loading ? 'Caricamento…' : 'Impossibile caricare.'}</Text>
      </View>
    );
  }
  const special = [d.index, d.checklist].filter((e) => !!e);
  const specialPaths = new Set(special.map((e) => e.path));
  const entries: Entry[] = [
    ...special,
    ...sortEntries(d.folders, sortOrder),
    ...sortEntries(
      d.files.filter((f) => !specialPaths.has(f.path)),
      sortOrder,
    ),
  ];
  if (!entries.length) {
    return <Text style={{ fontSize: 13, color: t.textMuted, paddingLeft: 8 + depth * INDENT + 22, paddingVertical: 8 }}>Cartella vuota</Text>;
  }
  return (
    <>
      {entries.map((e) => (
        <EntryNode key={e.path} entry={e} depth={depth} {...tree} />
      ))}
    </>
  );
}

function EntryNode({ entry: e, depth, ...tree }: { entry: Entry; depth: number } & TreeProps) {
  const t = useTheme();
  const stars = useStars();
  const isFolder = e.kind === 'folder';
  const open = isFolder && tree.expanded.has(e.path);
  const onLongPress = () => showActionSheet({ title: e.name, options: entryMenu(e, !!stars.data?.some((s) => s.path === e.path)) });

  if (e.kind === 'folder') {
    return (
      <>
        <Row
          depth={depth}
          folder
          open={open}
          current={tree.selected === e.path}
          icon={<Icon name="folderFill" size={16} color={t.folder} />}
          label={e.name}
          onToggle={() => tree.toggle(e.path)}
          onPress={() => {
            tree.toggle(e.path, true);
            openEntry(routes.folder(e.path));
          }}
          onLongPress={onLongPress}
        />
        {open ? <FolderChildren path={e.path} depth={depth + 1} {...tree} /> : null}
      </>
    );
  }

  const kind = attachmentKind(e.name);
  const icon =
    e.role === 'index' ? (
      <Icon name="index" size={16} color={t.info} />
    ) : e.role === 'checklist' ? (
      <Icon name="checklist" size={16} color={t.accentText} />
    ) : kind === 'pdf' || kind === 'image' ? (
      <Icon name={kind === 'pdf' ? 'pdf' : 'image'} size={16} color={t.folder} />
    ) : (
      <Icon name="doc" size={16} color={t.textMuted} />
    );
  const progress = 'progress' in e ? (e.progress as { done: number; total: number }) : null;
  return (
    <Row
      depth={depth}
      current={tree.selected === e.path}
      icon={icon}
      label={e.name}
      mono
      trailing={
        e.role === 'index' ? (
          <Icon name="lock" size={12} color={t.textMuted} />
        ) : progress?.total ? (
          <Text style={[styles.count, { color: t.textMuted }]}>
            {progress.done}/{progress.total}
          </Text>
        ) : e.author === 'agent' ? (
          <AgentAvatar agent={e.agent} size={16} round />
        ) : null
      }
      onPress={() => openEntry(routes.file(e.path))}
      onLongPress={onLongPress}
    />
  );
}

function Row({
  depth,
  folder,
  open,
  current,
  icon,
  label,
  mono,
  strong,
  trailing,
  onToggle,
  onPress,
  onLongPress,
}: {
  depth: number;
  folder?: boolean;
  open?: boolean;
  current: boolean;
  icon: ReactNode;
  label: string;
  mono?: boolean;
  strong?: boolean;
  trailing?: ReactNode;
  onToggle?: () => void;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: current, expanded: folder ? open : undefined }}
      style={({ pressed }) => [styles.row, { paddingLeft: 8 + depth * INDENT, backgroundColor: current ? t.fill : pressed ? t.fillSubtle : 'transparent' }]}>
      {folder ? (
        <Pressable onPress={onToggle} hitSlop={8} accessibilityLabel={open ? 'Comprimi' : 'Espandi'} style={styles.chevron}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={11} weight="semibold" color={t.textMuted} />
        </Pressable>
      ) : (
        <View style={styles.chevron} />
      )}
      {icon}
      <Text
        numberOfLines={1}
        style={[
          { flex: 1, fontSize: 14.5, color: current || strong ? t.text : t.textSecondary, fontWeight: strong ? '500' : '400' },
          mono && { fontFamily: fonts.mono, fontSize: 13.5 },
        ]}>
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function AccountRow() {
  const t = useTheme();
  const user = authUser.useValue();
  return (
    <Pressable
      onPress={() => openSection('settings')}
      style={({ pressed }) => [styles.account, { backgroundColor: pressed ? t.fillSubtle : 'transparent' }]}>
      <View style={[styles.avatar, { backgroundColor: brand.purple }]}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{initialsOf(user?.name ?? '?')}</Text>
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '500', color: t.text }}>
        {user?.name ?? 'Account'}
      </Text>
    </Pressable>
  );
}

function AgentsFooter() {
  const t = useTheme();
  const agents = useAgents().data ?? [];
  const lastWrite = useActivity().data?.[0];
  const shown = agents.slice(0, 2);
  return (
    <Pressable
      onPress={() => openSection('settings')}
      style={({ pressed }) => [styles.agents, { backgroundColor: pressed ? t.fill : t.fillSubtle }]}>
      {shown.length ? (
        <View style={{ flexDirection: 'row' }}>
          {shown.map((a, i) => (
            <View key={a.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 14, borderWidth: i ? 2 : 0, borderColor: t.sidebar }}>
              <AgentAvatar agent={a} size={24} round />
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.avatar, { width: 24, height: 24, borderRadius: 12, backgroundColor: t.iconWell }]}>
          <Icon name="robot" size={14} color={t.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '500', color: t.text }}>
          {agents.length ? `${agents.length} ${agents.length === 1 ? 'agente collegato' : 'agenti collegati'}` : 'Nessun agente'}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>
          {lastWrite ? `ultima scrittura ${relativeTime(lastWrite.at)}` : 'nessuna scrittura rilevata'}
        </Text>
      </View>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: agents.length ? t.success : t.textMuted }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderRightWidth: StyleSheet.hairlineWidth, paddingRight: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 12, borderCurve: 'continuous' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 12, borderRadius: 12, borderCurve: 'continuous' },
  label: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 8, marginLeft: 12, marginRight: 10 },
  labelText: { flex: 1, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38, paddingRight: 10, borderRadius: 10, borderCurve: 'continuous' },
  chevron: { width: 14, alignItems: 'center' },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 12, marginBottom: 6, borderRadius: 12 },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  agents: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderCurve: 'continuous' },
});
