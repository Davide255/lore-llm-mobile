import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';

import { useAutoHideHeader } from './auto-hide-header';
import { PdfView, canPreviewPdf } from './pdf-view';
import { EmptyState, ErrorState, HeaderTitle, Loading, Screen } from './ui';
import { kb } from '@/api';
import { useFolder } from '@/data/hooks';
import { fileSize, relativeTime } from '@/lib/format';
import { dirname } from '@/lib/paths';
import { attachmentKind, isPreviewableImage } from '@/lib/upload-plan';
import { useTheme } from '@/theme';

/**
 * An uploaded image or PDF. Images are drawn straight from the server (the request carries the
 * sign-in token); PDFs and SVGs cannot be shown yet, so the screen says so and gives the details.
 */
export function AttachmentView({ path }: { path: string }) {
  const t = useTheme();
  const name = path.split('/').pop() ?? '';
  const folder = useFolder(dirname(path));
  const entry = folder.data?.files.find((f) => f.path === path);
  const isPdf = attachmentKind(name) === 'pdf';
  const preview = Platform.OS !== 'web' && isPreviewableImage(name);
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [ratio, setRatio] = useState(1);
  const [failed, setFailed] = useState(false);
  const onScroll = useAutoHideHeader();

  useEffect(() => {
    if (!preview) return;
    let current = true;
    kb.attachmentRequest(path)
      .then((r) => current && setSource({ uri: r.url, headers: r.headers }))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [path, preview]);

  const subtitle = entry ? `${fileSize(entry.size)} · ${relativeTime(entry.updatedAt)}` : undefined;

  return (
    <>
      <Stack.Screen options={{ headerTitle: () => <HeaderTitle title={name} subtitle={subtitle} />, headerBlurEffect: 'systemMaterial' }} />
      {folder.loading ? (
        <Loading />
      ) : folder.error ? (
        <ErrorState error={folder.error} onRetry={folder.refresh} />
      ) : isPdf && canPreviewPdf ? (
        <PdfView path={path} />
      ) : !preview ? (
        <EmptyState
          icon={isPdf ? 'pdf' : 'image'}
          title="Anteprima non disponibile"
          message="Il file è nella base e gli agenti possono leggerlo; per ora l’app mostra le immagini PNG, JPG, GIF e WebP e, su iPhone, i PDF."
        />
      ) : failed ? (
        <EmptyState icon="warning" title="Impossibile caricare l’immagine" message="Controlla la connessione e riprova." />
      ) : (
        <Screen contentContainerStyle={{ paddingTop: 14 }} onScroll={onScroll} scrollEventThrottle={16}>
          {source ? (
            <Image
              source={source}
              resizeMode="contain"
              onLoad={(e) => {
                const { width, height } = e.nativeEvent.source;
                if (width && height) setRatio(width / height);
              }}
              onError={() => setFailed(true)}
              accessibilityLabel={name}
              style={{ width: '100%', aspectRatio: ratio, borderRadius: 10, backgroundColor: t.fillSubtle }}
            />
          ) : (
            <View style={{ paddingVertical: 60 }}>
              <Loading />
            </View>
          )}
          {entry && <Text style={{ marginTop: 14, fontSize: 12, color: t.textMuted }}>{`${name} · ${fileSize(entry.size)}`}</Text>}
        </Screen>
      )}
    </>
  );
}
