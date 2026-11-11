import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

import { EmptyState, Loading } from './ui';
import { kb } from '@/api';
import { basename } from '@/lib/paths';
import { useTheme } from '@/theme';

/** Only iOS can draw a PDF itself (WKWebView); Android's WebView cannot, so it keeps the share-sheet fallback. */
export const canPreviewPdf = Platform.OS === 'ios';

/** Downloads the PDF (the request carries the sign-in token) and shows it in-app, with native scroll and pinch zoom. */
export function PdfView({ path }: { path: string }) {
  const t = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setUri(null);
    setFailed(false);
    (async () => {
      const src = await kb.attachmentSource(path);
      const dest = new File(Paths.cache, `preview-${basename(path)}`);
      const file = await File.downloadFileAsync(src.uri, dest, { headers: src.headers, idempotent: true });
      if (current) setUri(file.uri);
    })().catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [path]);

  if (failed) {
    return <EmptyState icon="warning" title="Impossibile caricare il PDF" message="Controlla la connessione e riprova." />;
  }
  if (!uri) return <Loading />;
  return (
    <WebView
      source={{ uri }}
      originWhitelist={['*']}
      allowingReadAccessToURL={Paths.cache.uri}
      onError={() => setFailed(true)}
      onHttpError={() => setFailed(true)}
      style={{ flex: 1, backgroundColor: t.background }}
      accessibilityLabel={basename(path)}
    />
  );
}
