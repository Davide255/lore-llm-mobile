import { useNavigation } from 'expo-router';

/**
 * Leaves the study session modal as a whole: its screens live in a nested
 * stack, so `router.back()` would only step back inside it (result → quiz).
 * Going back on the parent navigator removes the modal and shows the tab.
 */
export function useCloseSession(): () => void {
  const navigation = useNavigation();
  return () => {
    const parent = navigation.getParent();
    if (parent?.canGoBack()) parent.goBack();
    else if (navigation.canGoBack()) navigation.goBack();
  };
}
