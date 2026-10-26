import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Icon } from '@/components/icon';
import { openPdf, useAttachmentSource } from '@/components/attachment';
import { HeaderTitle } from '@/components/ui';
import { attachmentKind } from '@/lib/attachments';
import { basename } from '@/lib/paths';
import { pathParam } from '@/lib/routes';
import { useTheme } from '@/theme';

/** An image (pinch to zoom) or a PDF (opened by the system) attached to a project. */
export default function AttachmentScreen() {
  const t = useTheme();
  const path = pathParam(useLocalSearchParams<{ path: string[] }>().path);
  const kind = attachmentKind(path);
  const source = useAttachmentSource(path);
  const { width, height } = useWindowDimensions();
  const [opening, setOpening] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ headerTitle: () => <HeaderTitle title={basename(path)} /> }} />
      {kind === 'image' ? (
        source ? (
          <ScrollView
            maximumZoomScale={5}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <Image source={{ uri: source.uri, headers: source.headers }} resizeMode="contain" style={{ width, height: height * 0.8 }} />
          </ScrollView>
        ) : (
          <ActivityIndicator style={{ flex: 1 }} />
        )
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
