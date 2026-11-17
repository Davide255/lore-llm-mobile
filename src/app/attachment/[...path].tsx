import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useHeaderToggle } from '@/components/auto-hide-header';
import { Icon } from '@/components/icon';
import { openPdf, useAttachmentSource } from '@/components/attachment';
import { HeaderItems } from '@/components/header-items';
import { PdfView, canPreviewPdf } from '@/components/pdf-view';
import { HeaderTitle } from '@/components/ui';
import { attachmentKind } from '@/lib/attachments';
import { basename } from '@/lib/paths';
import { pathParam } from '@/lib/routes';
import { useTheme } from '@/theme';
import { ZoomableImage } from '@/components/zoomable-image';

/** An image (pinch or double tap to zoom, tap to hide the header) or a PDF (shown in-app on iOS, otherwise opened by the system) attached to a project. */
export default function AttachmentScreen() {
  const t = useTheme();
  const path = pathParam(useLocalSearchParams<{ path: string[] }>().path);
  const kind = attachmentKind(path);
  const source = useAttachmentSource(path);
  const [opening, setOpening] = useState(false);
  const toggleHeader = useHeaderToggle();

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ headerTitle: () => <HeaderTitle title={basename(path)} />, headerBlurEffect: 'systemMaterial' }} />
      {kind === 'image' ? (
        source ? (
          <ZoomableImage source={{ uri: source.uri, headers: source.headers }} onTap={toggleHeader} accessibilityLabel={basename(path)} />
        ) : (
          <ActivityIndicator style={{ flex: 1 }} />
        )
      ) : canPreviewPdf ? (
        <>
          <HeaderItems right={[{ kind: 'button', label: 'Condividi', icon: 'share', onPress: () => openPdf(path) }]} />
          <PdfView path={path} />
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
          <Icon name="doc" size={44} color={t.accentText} />
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{basename(path)}</Text>
          <Pressable
            disabled={opening}
            onPress={async () => {
              setOpening(true);
              await openPdf(path);
              setOpening(false);
            }}>
            {opening ? <ActivityIndicator /> : <Text style={{ color: t.accentText, fontSize: 16 }}>Apri PDF</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}
