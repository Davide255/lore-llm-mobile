import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useHeaderToggle } from '@/components/auto-hide-header';
import { fileIcon, Icon } from '@/components/icon';
import { shareAttachment, useAttachmentSource } from '@/components/attachment';
import { DocumentView, canPreviewDocument } from '@/components/document-view';
import { HeaderItems } from '@/components/header-items';
import { HeaderTitle } from '@/components/ui';
import { attachmentKind } from '@/lib/attachments';
import { basename } from '@/lib/paths';
import { pathParam } from '@/lib/routes';
import { useTheme } from '@/theme';
import { ZoomableImage } from '@/components/zoomable-image';

/**
 * An image (pinch or double tap to zoom, tap to hide the header) or a document attached to a project:
 * a PDF or a Word, Excel or PowerPoint file, shown in-app on iOS (with «Condividi» to open it in
 * another app) and otherwise handed to the system.
 */
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
      ) : canPreviewDocument ? (
        <>
          <HeaderItems right={[{ kind: 'button', label: 'Condividi', icon: 'share', onPress: () => shareAttachment(path) }]} />
          <DocumentView path={path} />
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
          <Icon name={fileIcon(path)} size={44} color={t.accentText} />
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{basename(path)}</Text>
          <Pressable
            disabled={opening}
            onPress={async () => {
              setOpening(true);
              await shareAttachment(path);
              setOpening(false);
            }}>
            {opening ? <ActivityIndicator /> : <Text style={{ color: t.accentText, fontSize: 16 }}>{kind === 'pdf' ? 'Apri PDF' : 'Apri'}</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}
