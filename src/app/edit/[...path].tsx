import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import { KBError, type FileDocument } from '@/api';
import { showActionSheet } from '@/components/action-sheet';
import { BlockEditor, type BlockEditorHandle } from '@/components/editor/block-editor';
import { serializeWithOffsets, toBlocks, type EditBlock } from '@/components/editor/model';
import { SourceEditor, type SourceEditorHandle } from '@/components/editor/source-editor';
import { FLOATING_TOOLBAR_HEIGHT, FloatingToolbar, type ToolbarTool } from '@/components/floating-toolbar';
import { MarkdownView } from '@/components/markdown';
import { HeaderItems } from '@/components/header-items';
import { ErrorState, HeaderTitle, Loading } from '@/components/ui';
import { actions, useFile } from '@/data/hooks';
import { diffLines, diffStats } from '@/lib/diff';
import { parse, serialize } from '@/lib/markdown';
import { pathParam } from '@/lib/routes';
import { useTheme } from '@/theme';
import { useSplitLayout } from '@/theme/layout';

type Mode = 'preview' | 'source';
const normalize = (s: string) => serialize(parse(s));

type Pane = { ref: { current: ComponentRef<typeof ScrollView> | null }; content: number; view: number; expected: number | null };

/** Keeps two scroll views at the same relative position (side-by-side source and preview). */
function useScrollSync() {
  const panes = useRef<Record<'a' | 'b', Pane>>({
    a: { ref: { current: null }, content: 0, view: 0, expected: null },
    b: { ref: { current: null }, content: 0, view: 0, expected: null },
  }).current;
  const bind = (me: 'a' | 'b', other: 'a' | 'b') => ({
    ref: panes[me].ref,
    scrollEventThrottle: 16,
    onLayout: (e: { nativeEvent: { layout: { height: number } } }) => {
      panes[me].view = e.nativeEvent.layout.height;
    },
    onContentSizeChange: (_w: number, h: number) => {
      panes[me].content = h;
    },
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const mine = panes[me];
      // Ignore the echo of a scroll we triggered ourselves.
      if (mine.expected !== null && Math.abs(y - mine.expected) < 1.5) {
        mine.expected = null;
        return;
      }
      const o = panes[other];
      const range = mine.content - mine.view;
      const otherRange = o.content - o.view;
      if (range <= 0 || otherRange <= 0) return;
      const target = Math.max(0, Math.min(otherRange, (y / range) * otherRange));
      o.expected = target;
      o.ref.current?.scrollTo({ y: target, animated: false });
    },
  });
  return { source: bind('a', 'b'), preview: bind('b', 'a') };
}

export default function EditScreen() {
  const path = pathParam(useLocalSearchParams<{ path: string[] }>().path);
  const file = useFile(path);
  const doc = file.data;

  if (file.error) return <ErrorState error={file.error} onRetry={file.refresh} />;
  if (!doc) return <Loading />;
  if (doc.role === 'index') return <ErrorState error={new Error('index.md è generato automaticamente e non si modifica.')} />;
  return <Editor initial={doc} />;
}

/** B1 live preview · B2 source · B3 exit with unsaved changes. */
function Editor({ initial }: { initial: FileDocument }) {
  const t = useTheme();
  // Tablet: source and rendered preview side by side (no mode switch).
  const sideBySide = useSplitLayout();
  // Devices with a side strip (iPhone Duo) report it as a side inset.
  const insets = useSafeAreaInsets();
  // Snapshot the document once: background refetches must not reset the editor.
  const [doc] = useState(initial);
  const navigation = useNavigation();
  const [mode, setMode] = useState<Mode>(sideBySide ? 'source' : 'preview');
  const [blocks, setBlocks] = useState<EditBlock[]>(() => toBlocks(doc.content));
  const [source, setSource] = useState(doc.content);
  const [saving, setSaving] = useState(false);
  const blockRef = useRef<BlockEditorHandle>(null);
  const sourceRef = useRef<SourceEditorHandle>(null);
  const sync = useScrollSync();
  const history = useRef<string[]>([]);
  const lastPush = useRef(0);
  const leaving = useRef(false);

  const current = useMemo(() => (mode === 'preview' ? serializeWithOffsets(blocks).source : source), [mode, blocks, source]);
  const baseline = useMemo(() => normalize(doc.content), [doc.content]);
  const normalized = useMemo(() => normalize(current), [current]);
  const dirty = normalized !== baseline;
  const changedLines = useMemo(() => {
    const s = diffStats(diffLines(baseline, normalized));
    return Math.max(s.added, s.removed);
  }, [baseline, normalized]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Group keystrokes into undo steps of ~0.6s.
  const record = () => {
    const now = Date.now();
    if (now - lastPush.current > 600) history.current.push(current);
    lastPush.current = now;
    if (history.current.length > 100) history.current.shift();
  };
  const changeBlocks = (next: EditBlock[]) => {
    record();
    setBlocks(next);
  };
  const changeSource = (next: string) => {
    record();
    setSource(next);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev === undefined) return;
    lastPush.current = 0;
    if (mode === 'preview') setBlocks(toBlocks(prev));
    else setSource(prev);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (sideBySide) return;
    const keyboardUp = Keyboard.isVisible();
    if (next === 'source') {
      const { source: src, offsets } = serializeWithOffsets(blocks);
      const caret = blockRef.current?.caret();
      setSource(src);
      setMode('source');
      if (keyboardUp && caret) setTimeout(() => sourceRef.current?.focus((offsets.get(caret.id) ?? 0) + caret.offset), 50);
    } else {
      const caret = sourceRef.current?.caret() ?? 0;
      const nb = toBlocks(source);
      const caretLine = source.slice(0, caret).split('\n').length - 1;
      const target = [...nb].reverse().find((b) => b.line <= caretLine) ?? nb[0];
      const lineStart = source.lastIndexOf('\n', caret - 1) + 1;
      const lineText = source.slice(lineStart, source.indexOf('\n', caret) === -1 ? undefined : source.indexOf('\n', caret));
      const markerLen = lineText.length - lineText.replace(/^(#{1,6}\s|\s*[-*+]\s(\[[ xX]\]\s)?|\s*\d+[.)]\s|>\s?)/, '').length;
      const textLen = 'text' in target ? target.text.length : 0;
      setBlocks(nb);
      setMode('preview');
      if (keyboardUp) {
        const offset = target.line === caretLine ? Math.min(textLen, Math.max(0, caret - lineStart - markerLen)) : textLen;
        setTimeout(() => blockRef.current?.focus(target.id, offset), 50);
      }
    }
  };

  const write = async (force = false): Promise<boolean> => {
    setSaving(true);
    try {
      await actions.writeFile(doc.path, current, force ? undefined : doc.version);
      return true;
    } catch (e) {
      if (e instanceof KBError && e.code === 'conflict') {
        return new Promise((resolve) =>
          Alert.alert('File modificato altrove', `${e.message}\nVuoi sovrascrivere la versione più recente?`, [
            { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Sovrascrivi', style: 'destructive', onPress: () => write(true).then(resolve) },
          ]),
        );
      }
      Alert.alert('Salvataggio non riuscito', e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    leaving.current = true;
    router.back();
  };
  const saveAndClose = async () => {
    if (!dirty || (await write())) close();
  };

  const confirmExit = (proceed: () => void) =>
    showActionSheet({
      title: 'Modifiche non salvate',
      message: `Hai cambiato ${changedLines === 1 ? '1 riga' : `${changedLines} righe`} in ${doc.name}.`,
      options: [
        {
          label: 'Salva e chiudi',
          primary: true,
          onPress: async () => {
            if (await write()) {
              leaving.current = true;
              proceed();
            }
          },
        },
        {
          label: 'Scarta le modifiche',
          destructive: true,
          onPress: () => {
            leaving.current = true;
            proceed();
          },
        },
      ],
      cancelLabel: 'Continua a modificare',
    });

  // Intercept swipe-down / Android back with unsaved changes.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirtyRef.current || leaving.current) return;
        e.preventDefault();
        Keyboard.dismiss();
        confirmExit(() => navigation.dispatch(e.data.action));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigation, changedLines],
  );

  const previewTools: ToolbarTool[] = [
    { key: 'b', icon: 'bold', label: 'Grassetto', onPress: () => blockRef.current?.wrap('**', '**') },
    { key: 'i', icon: 'italic', label: 'Corsivo', onPress: () => blockRef.current?.wrap('*', '*') },
    { key: 'h', icon: 'heading', label: 'Titolo', onPress: () => blockRef.current?.format('heading') },
    { key: 'l', icon: 'list', label: 'Elenco puntato', onPress: () => blockRef.current?.format('bullet') },
    { key: 'c', icon: 'checklist', label: 'Checklist', onPress: () => blockRef.current?.format('task') },
    { key: 'a', icon: 'link', label: 'Link', onPress: () => blockRef.current?.wrap('[', '](file.md)', 'testo') },
    { key: 'k', icon: 'code', label: 'Codice', onPress: () => blockRef.current?.wrap('`', '`') },
    { key: 'q', icon: 'quote', label: 'Citazione', onPress: () => blockRef.current?.format('quote') },
  ];
  const sourceTools: ToolbarTool[] = [
    { key: 'h', glyph: '#', label: 'Titolo', onPress: () => sourceRef.current?.toggleLinePrefix('# ') },
    { key: 'b', glyph: '**', label: 'Grassetto', onPress: () => sourceRef.current?.wrap('**', '**') },
    { key: 'l', glyph: '-', label: 'Elenco', onPress: () => sourceRef.current?.toggleLinePrefix('- ') },
    { key: 'c', glyph: '[ ]', label: 'Casella', onPress: () => sourceRef.current?.toggleLinePrefix('- [ ] ') },
    { key: 'a', glyph: '[]', label: 'Link', onPress: () => sourceRef.current?.wrap('[', '](file.md)', 'testo') },
    { key: 'k', glyph: '`', label: 'Codice', onPress: () => sourceRef.current?.wrap('`', '`') },
    { key: 'u', icon: 'undo', label: 'Annulla modifica', onPress: undo },
  ];

  // Android: edge-to-edge means content must make room for the IME itself.
  const keyboard = useAnimatedKeyboard();
  const keyboardPad = useAnimatedStyle(() => ({ paddingBottom: Platform.OS === 'android' ? keyboard.height.value : 0 }));

  return (
    <>
      <Stack.Screen
        options={{
          gestureEnabled: !dirty,
          headerTransparent: false,
          headerStyle: { backgroundColor: t.background },
          headerTitle: () => (
            <HeaderTitle title={doc.name} subtitle={dirty ? 'Non salvato' : undefined} subtitleColor={t.warning} />
          ),
        }}
      />
      <HeaderItems
        left={[{ kind: 'button', label: 'Annulla', onPress: () => (dirty ? confirmExit(close) : close()) }]}
        right={[{ kind: 'button', label: 'Salva', variant: 'prominent', disabled: !dirty || saving, onPress: saveAndClose }]}
      />
      <Animated.View style={[{ flex: 1, backgroundColor: t.background, paddingLeft: insets.left, paddingRight: insets.right }, keyboardPad]}>
        {sideBySide ? null : (
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
          <SegmentedControl
            values={['Anteprima', 'Sorgente']}
            selectedIndex={mode === 'preview' ? 0 : 1}
            onValueChange={(v) => switchMode(v === 'Anteprima' ? 'preview' : 'source')}
            appearance={t.scheme}
            tintColor={t.accent}
          />
        </View>
        )}
        <View style={{ flex: 1, flexDirection: 'row' }}>
        <ScrollView
          {...(sideBySide ? sync.source : null)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: FLOATING_TOOLBAR_HEIGHT + 40 }}>
          {mode === 'preview' ? (
            <BlockEditor ref={blockRef} blocks={blocks} onChange={changeBlocks} />
          ) : (
            <SourceEditor ref={sourceRef} value={source} onChange={changeSource} />
          )}
          {/* Tapping below the last line puts the caret at the end. */}
          <Pressable
            style={{ minHeight: 160 }}
            onPress={() => (mode === 'preview' ? blockRef.current?.focus() : sourceRef.current?.focus(source.length))}
          />
        </ScrollView>
        {sideBySide ? (
          <ScrollView
            {...sync.preview}
            style={{ flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.hairline }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: FLOATING_TOOLBAR_HEIGHT + 40 }}>
            <MarkdownView content={source} path={doc.path} />
          </ScrollView>
        ) : null}
        </View>
        <FloatingToolbar
          tools={mode === 'preview' && !sideBySide ? previewTools : sourceTools}
          trailing={{ key: 'kb', icon: 'keyboardHide', label: 'Nascondi tastiera', onPress: () => Keyboard.dismiss() }}
        />
      </Animated.View>
    </>
  );
}
