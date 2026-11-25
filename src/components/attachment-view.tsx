import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { canShareAttachment, shareAttachment } from './attachment';
import { useHeaderToggle } from './auto-hide-header';
import { HeaderItems } from './header-items';
import { DocumentView, canPreviewDocument } from './document-view';
import { fileIcon } from './icon';
import { EmptyState, ErrorState, HeaderTitle, Loading } from './ui';
import { ZoomableImage } from './zoomable-image';
import { kb } from '@/api';
import { useFolder } from '@/data/hooks';
import { fileSize, relativeTime } from '@/lib/format';
import { dirname } from '@/lib/paths';
import { attachmentKind, isPreviewableImage } from '@/lib/upload-plan';
import { useTheme } from '@/theme';

/**
 * An uploaded image, PDF or Office document (.docx, .xlsx, .pptx). Images are drawn straight from
 * the server (the request carries the sign-in token) and can be zoomed (pinch, double tap; a single
 * tap hides the header); PDFs and Office documents are shown on iOS, where «Condividi» opens them in
 * another app (Word, Excel, PowerPoint…); anything else gets a short explanation.
 */
export function AttachmentView({ path }: { path: string }) {
  const t = useTheme();
  const name = path.split('/').pop() ?? '';
  const folder = useFolder(dirname(path));
  const entry = folder.data?.files.find((f) => f.path === path);
  const kind = attachmentKind(name);
  const isDocument = kind === 'pdf' || kind === 'office';
  const preview = Platform.OS !== 'web' && isPreviewableImage(name);
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const toggleHeader = useHeaderToggle();

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
      {canShareAttachment && <HeaderItems right={[{ kind: 'button', label: 'Condividi', icon: 'share', onPress: () => shareAttachment(path) }]} />}
      {folder.loading ? (
        <Loading />
      ) : folder.error ? (
        <ErrorState error={folder.error} onRetry={folder.refresh} />
      ) : isDocument && canPreviewDocument ? (
        <DocumentView path={path} />
      ) : !preview ? (
        <EmptyState
          icon={fileIcon(name)}
          title="Anteprima non disponibile"
          message="Il file è nella base e gli agenti possono leggerlo; per ora l’app mostra le immagini PNG, JPG, GIF e WebP e, su iPhone, i PDF e i documenti Word, Excel e PowerPoint."
        />
      ) : failed ? (
        <EmptyState icon="warning" title="Impossibile caricare l’immagine" message="Controlla la connessione e riprova." />
      ) : source ? (
        <View style={{ flex: 1, backgroundColor: t.background }}>
          <ZoomableImage source={source} onTap={toggleHeader} onError={() => setFailed(true)} accessibilityLabel={name} />
        </View>
      ) : (
        <Loading />
      )}
    </>
  );
}
