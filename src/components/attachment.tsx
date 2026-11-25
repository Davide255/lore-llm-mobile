import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Share, Text, View } from 'react-native';

import { fileIcon, Icon } from './icon';
import { showToast } from './toast';
import { kb, type AttachmentSource } from '@/api';
import { basename } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { mimeType } from '@/lib/upload-plan';
import { useTheme } from '@/theme';

/** The authenticated URL of an attachment, null while it is being prepared. */
export function useAttachmentSource(path: string): AttachmentSource | null {
  const [loaded, setLoaded] = useState<{ path: string; source: AttachmentSource } | null>(null);
  useEffect(() => {
    let current = true;
    kb.attachmentSource(path)
      .then((source) => current && setLoaded({ path, source }))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [path]);
  return loaded?.path === path ? loaded.source : null;
}

/**
 * Attachments can be handed to other apps on iOS (React Native's share sheet takes a file URL) and on
 * Android (expo-sharing turns the file into a content URI other apps may read). Not on the web.
 */
export const canShareAttachment = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Downloads an attachment (image, PDF or Office document) and hands the file to the system share
 * sheet, which can send it to another app, save it to Files or open it in a PDF reader or in
 * Word, Excel or PowerPoint. The copy keeps the attachment's name, so its type is known; on
 * Android the MIME type is passed too, which decides the apps offered.
 */
export async function shareAttachment(path: string): Promise<void> {
  const name = basename(path);
  if (!canShareAttachment) {
    showToast({ icon: 'doc', subject: name, message: 'la condivisione dei file non è disponibile su questo sistema' });
    return;
  }
  try {
    const src = await kb.attachmentSource(path);
    // The offline copy (app documents) or a fresh download to the cache: both folders are shareable on Android.
    const uri = src.uri.startsWith('file:')
      ? src.uri
      : (await File.downloadFileAsync(src.uri, new File(Paths.cache, name), { headers: src.headers, idempotent: true })).uri;
    if (Platform.OS === 'android') {
      await Sharing.shareAsync(uri, { mimeType: mimeType(name) ?? undefined, dialogTitle: `Apri «${name}» con…` });
    } else {
      await Share.share({ url: uri });
    }
  } catch {
    showToast({ icon: 'doc', subject: name, message: 'impossibile condividere il file' });
  }
}

/** An image in a document: its natural proportions, at most `width` wide; a tap opens it full screen. */
export function AttachmentImage({ path, width }: { path: string; width?: number | null }) {
  const t = useTheme();
  const source = useAttachmentSource(path);
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!source) return;
    Image.getSizeWithHeaders(
      source.uri,
      source.headers,
      (w, h) => w && h && setRatio(w / h),
      () => {},
    );
  }, [source]);
  return (
    <Pressable
      onPress={() => router.push(routes.attachment(path))}
      accessibilityRole="imagebutton"
      accessibilityLabel={basename(path)}
      style={{ marginBottom: 12, alignSelf: 'center', width: '100%', maxWidth: width ?? undefined }}>
      {source ? (
        <Image
          source={{ uri: source.uri, headers: source.headers }}
          resizeMode="contain"
          style={{ width: '100%', aspectRatio: ratio ?? 1.5, borderRadius: 8, backgroundColor: t.fillSubtle }}
        />
      ) : (
        <View style={{ aspectRatio: 1.5, borderRadius: 8, backgroundColor: t.fillSubtle, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      )}
    </Pressable>
  );
}

/** A PDF or an Office document in a note, as a card that opens it. */
export function DocumentCard({ path }: { path: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push(routes.attachment(path))}
      accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, marginBottom: 12, backgroundColor: t.cell }}>
      <Icon name={fileIcon(path)} size={22} color={t.accentText} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: t.text }}>
        {basename(path)}
      </Text>
      <Icon name="chevronRight" size={16} color={t.textMuted} />
    </Pressable>
  );
}
