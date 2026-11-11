import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { useTheme } from '@/theme';
import { useSplitLayout } from '@/theme/layout';

/** System tab bar (liquid glass on iOS 26, Material 3 on Android). */
export default function TabsLayout() {
  const t = useTheme();
  // On a tablet the sidebar switches sections: the tabs stay, without a bar.
  if (useSplitLayout()) return <SidebarTabs />;
  return (
    <NativeTabs tintColor={t.accentText} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(projects)">
        <NativeTabs.Trigger.Icon sf={{ default: 'folder', selected: 'folder.fill' }} md="folder" />
        <NativeTabs.Trigger.Label>Progetti</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Icon sf={{ default: 'bolt', selected: 'bolt.fill' }} md="bolt" />
        <NativeTabs.Trigger.Label>Attività</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
        <NativeTabs.Trigger.Label>Impostazioni</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/** Headless tabs: the same three sections, switched from the sidebar (see components/sidebar). */
function SidebarTabs() {
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot />
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="(projects)" href="/" />
        <TabTrigger name="activity" href="/activity" />
        <TabTrigger name="settings" href="/settings" />
      </TabList>
    </Tabs>
  );
}
