"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, CompletionContext } from "@codemirror/autocomplete";
import { basicSetup } from "codemirror";
import { encodeRoom } from "@/lib/identity";
import { createLatexCompletions, type BibEntryHandle } from "@/lib/editor/autocomplete";
import { envPairHighlight } from "@/lib/editor/env-pairs";

export type CodeMirrorHandle = {
  gotoLine: (line: number) => void;
  insertAtCursor: (text: string) => void;
  insertUsePackage: (name: string) => void;
  getDocText: () => string;
};

export type Peer = {
  clientId: number;
  name: string;
  color: string;
  typing?: boolean;
};

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
  onDocChange?: (text: string) => void;
  getBibEntries?: () => BibEntryHandle[];
};

const TYPING_DEBOUNCE_MS = 1500;
const DOC_CHANGE_DEBOUNCE_MS = 300;

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
  onDocChange,
  getBibEntries,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSaveRef = useRef(onSave);
  const onCompileRef = useRef(onCompile);
  const onPeersRef = useRef(onPeers);
  const onConnRef = useRef(onConnectionChange);
  const onReadyRef = useRef(onReady);
  const onDocChangeRef = useRef(onDocChange);
  const getBibEntriesRef = useRef(getBibEntries);

  onSaveRef.current = onSave;
  onCompileRef.current = onCompile;
  onPeersRef.current = onPeers;
  onConnRef.current = onConnectionChange;
  onReadyRef.current = onReady;
  onDocChangeRef.current = onDocChange;
  getBibEntriesRef.current = getBibEntries;

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

    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    let isTyping = false;
    const setTyping = (active: boolean) => {
      if (active === isTyping) return;
      isTyping = active;
      provider.awareness.setLocalStateField("typing", active);
    };

    const updatePeers = () => {
      const states = provider.awareness.getStates();
      const me = provider.awareness.clientID;
      const peers: Peer[] = [];
      states.forEach((state, clientId) => {
        if (clientId === me) return;
        const s = state as { user?: { name: string; color: string }; typing?: boolean };
        const u = s.user;
        if (u) peers.push({ clientId, name: u.name, color: u.color, typing: !!s.typing });
      });
      onPeersRef.current?.(peers);
    };
    provider.awareness.on("change", updatePeers);
    updatePeers();

    const undoMgr = new Y.UndoManager(ytext);

    let docChangeTimer: ReturnType<typeof setTimeout> | null = null;

    const latexCompletionSource = createLatexCompletions({
      getBibEntries: () => getBibEntriesRef.current?.() ?? [],
    });

    const view = new EditorView({
      state: EditorState.create({
        extensions: [
          basicSetup,
          oneDark,
          ...(isTex ? [StreamLanguage.define(stex)] : []),
          ...(isTex ? [envPairHighlight()] : []),
          autocompletion({
            override: isTex
              ? [(ctx: CompletionContext) => latexCompletionSource(ctx)]
              : undefined,
            activateOnTyping: true,
            closeOnBlur: true,
          }),
          yCollab(ytext, provider.awareness, { undoManager: undoMgr }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              setTyping(true);
              if (typingTimer) clearTimeout(typingTimer);
              typingTimer = setTimeout(() => setTyping(false), TYPING_DEBOUNCE_MS);

              if (onDocChangeRef.current) {
                if (docChangeTimer) clearTimeout(docChangeTimer);
                docChangeTimer = setTimeout(() => {
                  onDocChangeRef.current?.(u.state.doc.toString());
                }, DOC_CHANGE_DEBOUNCE_MS);
              }
            }
          }),
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

    // Fire initial onDocChange once doc is hydrated (provider sync).
    const initialFire = setTimeout(() => {
      onDocChangeRef.current?.(view.state.doc.toString());
    }, 500);

    const handle: CodeMirrorHandle = {
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
      insertAtCursor(text: string) {
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
        });
        view.focus();
      },
      insertUsePackage(name: string) {
        const doc = view.state.doc.toString();
        const line = `\\usepackage{${name}}\n`;
        // Skip if already present
        const re = new RegExp(`\\\\(?:usepackage|RequirePackage)(?:\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${escapeRegex(name)}\\b[^}]*\\}`);
        if (re.test(doc)) return;
        // Try to insert before \begin{document}, otherwise at end of preamble (or top).
        const beginDoc = doc.search(/\\begin\{document\}/);
        let insertAt = 0;
        if (beginDoc >= 0) {
          // Insert at start of the line containing \begin{document}
          const lineStart = doc.lastIndexOf("\n", beginDoc - 1) + 1;
          insertAt = lineStart;
        } else {
          // Insert at top
          insertAt = 0;
        }
        view.dispatch({
          changes: { from: insertAt, insert: line },
        });
      },
      getDocText() {
        return view.state.doc.toString();
      },
    };
    onReadyRef.current?.(handle);

    return () => {
      if (typingTimer) clearTimeout(typingTimer);
      if (docChangeTimer) clearTimeout(docChangeTimer);
      clearTimeout(initialFire);
      view.destroy();
      provider.awareness.off("change", updatePeers);
      provider.destroy();
      ydoc.destroy();
      viewRef.current = null;
    };
  }, [projectId, path, userName, userColor]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
