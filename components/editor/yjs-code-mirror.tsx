"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { search } from "@codemirror/search";
import { basicSetup } from "codemirror";
import { encodeRoom } from "@/lib/identity";
import { useTheme } from "@/components/theme/theme-toggle";

// Light editor palette modelled on Overleaf's default "textmate" theme.
const textmate = [
  EditorView.theme(
    {
      "&": { backgroundColor: "#ffffff", color: "#000000" },
      ".cm-gutters": { backgroundColor: "#f0f0f0", color: "#333333", border: "none" },
      ".cm-activeLine": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
      ".cm-activeLineGutter": { backgroundColor: "#dcdcdc" },
    },
    { dark: false },
  ),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.tagName, color: "#0000ff" },
      { tag: tags.comment, color: "#4c886b" },
      { tag: tags.number, color: "#0000cd" },
      { tag: tags.invalid, color: "#ff0000" },
    ]),
  ),
];

// Dark counterpart of textmate, on the same slate palette as the app chrome.
const slateDark = [
  EditorView.theme(
    {
      "&": { backgroundColor: "#1a1f27", color: "#e2e6ea" },
      ".cm-content": { caretColor: "#e2e6ea" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#e2e6ea" },
      ".cm-gutters": { backgroundColor: "#1a1f27", color: "#5a6679", border: "none" },
      ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
      ".cm-activeLineGutter": { backgroundColor: "#232a35", color: "#b3bcc8" },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        { backgroundColor: "rgba(79, 140, 247, 0.3)" },
      ".cm-matchingBracket": { backgroundColor: "rgba(255, 255, 255, 0.1)", outline: "none" },
      ".cm-foldPlaceholder": { backgroundColor: "#2c3645", border: "none", color: "#b3bcc8" },
      ".cm-tooltip": { backgroundColor: "#1e2530", border: "1px solid #2c3645" },
    },
    { dark: true },
  ),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.tagName, color: "#6cb6ff" },
      { tag: tags.comment, color: "#6fb28f", fontStyle: "italic" },
      { tag: tags.number, color: "#b5a1ff" },
      { tag: tags.invalid, color: "#ff6b6b" },
    ]),
  ),
];

const editorTheme = (theme: "light" | "dark") =>
  theme === "light" ? textmate : slateDark;

// Short labels for the Cmd-F panel; styled as chips/icons in globals.css.
const searchPhrases = EditorState.phrases.of({
  next: "↓",
  previous: "↑",
  all: "All",
  "match case": "Aa",
  regexp: ".*",
  "by word": "Word",
  replace: "Replace",
  "replace all": "Replace all",
});

export type CodeMirrorHandle = {
  gotoLine: (line: number) => void;
};

export type Peer = { clientId: number; name: string; color: string };

type Props = {
  projectId: string;
  path: string;
  userName: string;
  userColor: string;
  onSave?: () => void;
  onCompile?: () => void;
  onPeers?: (peers: Peer[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  onReady?: (handle: CodeMirrorHandle) => void;
};

export function YjsCodeMirror({
  projectId,
  path,
  userName,
  userColor,
  onSave,
  onCompile,
  onPeers,
  onConnectionChange,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const theme = useTheme();
  const onSaveRef = useRef(onSave);
  const onCompileRef = useRef(onCompile);
  const onPeersRef = useRef(onPeers);
  const onConnRef = useRef(onConnectionChange);
  const onReadyRef = useRef(onReady);

  onSaveRef.current = onSave;
  onCompileRef.current = onCompile;
  onPeersRef.current = onPeers;
  onConnRef.current = onConnectionChange;
  onReadyRef.current = onReady;

  useEffect(() => {
      if (!containerRef.current) return;
      const isTex =
        path.endsWith(".tex") ||
        path.endsWith(".bib") ||
        path.endsWith(".sty") ||
        path.endsWith(".cls");

      const ydoc = new Y.Doc();
      const ytext = ydoc.getText("content");
      const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
      const serverUrl = `${wsProto}://${window.location.host}/_yjs`;
      const room = encodeRoom(projectId, path);
      const provider = new WebsocketProvider(serverUrl, room, ydoc, {
        connect: true,
      });
      provider.awareness.setLocalStateField("user", {
        name: userName,
        color: userColor,
      });

      provider.on("status", (e: { status: string }) => {
        onConnRef.current?.(e.status === "connected");
      });

      const updatePeers = () => {
        const states = provider.awareness.getStates();
        const me = provider.awareness.clientID;
        const peers: Peer[] = [];
        states.forEach((state, clientId) => {
          if (clientId === me) return;
          const u = (state as { user?: Peer }).user;
          if (u) peers.push({ clientId, name: u.name, color: u.color });
        });
        onPeersRef.current?.(peers);
      };
      provider.awareness.on("change", updatePeers);
      updatePeers();

      const undoMgr = new Y.UndoManager(ytext);

      const view = new EditorView({
        state: EditorState.create({
          extensions: [
            basicSetup,
            search({ top: true }),
            searchPhrases,
            themeCompartment.current.of(
              editorTheme(
                document.documentElement.dataset.theme === "light" ? "light" : "dark",
              ),
            ),
            ...(isTex ? [StreamLanguage.define(stex)] : []),
            yCollab(ytext, provider.awareness, { undoManager: undoMgr }),
            keymap.of([
              indentWithTab,
              ...defaultKeymap,
              {
                key: "Mod-s",
                preventDefault: true,
                run: () => {
                  onSaveRef.current?.();
                  return true;
                },
              },
              {
                key: "Mod-Enter",
                preventDefault: true,
                run: () => {
                  onCompileRef.current?.();
                  return true;
                },
              },
            ]),
            EditorView.theme({
              "&": { height: "100%" },
              ".cm-scroller": { overflow: "auto" },
            }),
          ],
        }),
        parent: containerRef.current,
      });
      viewRef.current = view;
      onReadyRef.current?.({
        gotoLine(line: number) {
          const total = view.state.doc.lines;
          const target = Math.max(1, Math.min(total, line));
          const li = view.state.doc.line(target);
          view.dispatch({
            selection: { anchor: li.from, head: li.from },
            effects: EditorView.scrollIntoView(li.from, { y: "center" }),
          });
          view.focus();
        },
      });

      return () => {
        view.destroy();
        provider.awareness.off("change", updatePeers);
        provider.destroy();
        ydoc.destroy();
        viewRef.current = null;
      };
  }, [projectId, path, userName, userColor]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(editorTheme(theme)),
    });
  }, [theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
