import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

import { useAutoHideHeader } from './auto-hide-header';
import { EmptyState, Loading } from './ui';
import { kb } from '@/api';
import { documentLabel } from '@/lib/attachments';
import { basename } from '@/lib/paths';
import { useTheme } from '@/theme';

/**
 * Only iOS can draw a PDF or an Office document (.docx, .xlsx, .pptx) itself: WKWebView renders a
 * local file of those types natively. Android's WebView cannot, so it keeps the share-sheet fallback.
 */
export const canPreviewDocument = Platform.OS === 'ios';

/**
 * Downloads a PDF or an Office document (the request carries the sign-in token) and shows it in-app,
 * with native scroll and pinch zoom. WKWebView picks the renderer from the file's extension, so the
 * local copy always keeps the attachment's own name.
 */
export function DocumentView({ path }: { path: string }) {
  const t = useTheme();
  // Both belong to the path they were found for, so another path starts out loading.
  const [loaded, setLoaded] = useState<{ path: string; uri: string } | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const onScroll = useAutoHideHeader();
  const uri = loaded?.path === path ? loaded.uri : null;
  const failed = failedPath === path;
  const fail = () => setFailedPath(path);

  useEffect(() => {
    let current = true;
    (async () => {
      const src = await kb.attachmentSource(path);
      // A copy kept on the device is shown as it is; otherwise it is downloaded (the request carries the token).
      // The download keeps the attachment's name: its extension tells WKWebView how to draw it.
      if (src.uri.startsWith('file:')) {
        if (current) setLoaded({ path, uri: src.uri });
        return;
      }
      const dest = new File(Paths.cache, `preview-${basename(path)}`);
      const file = await File.downloadFileAsync(src.uri, dest, { headers: src.headers, idempotent: true });
      if (current) setLoaded({ path, uri: file.uri });
    })().catch(() => current && setFailedPath(path));
    return () => {
      current = false;
    };
  }, [path]);

  if (failed) {
    return <EmptyState icon="warning" title={`Impossibile caricare ${documentLabel(path)}`} message="Controlla la connessione e riprova." />;
  }
  if (!uri) return <Loading />;
  return (
    <WebView
      source={{ uri }}
      originWhitelist={['*']}
      // The folder holding the file: the cache (fresh download) or the saved copy kept for offline use.
      allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)}
      // The header is transparent: start the first page below it (the inset follows it as it hides).
      contentInsetAdjustmentBehavior="automatic"
      onScroll={onScroll}
      onError={fail}
      onHttpError={fail}
      style={{ flex: 1, backgroundColor: t.background }}
      accessibilityLabel={basename(path)}
    />
  );
}
