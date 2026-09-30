"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import { encodeRoom } from "@/lib/identity";
import { useTheme } from "@/components/theme/theme-toggle";

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
            themeCompartment.current.of(
              document.documentElement.dataset.theme === "light" ? [] : oneDark,
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
      effects: themeCompartment.current.reconfigure(
        theme === "light" ? [] : oneDark,
      ),
    });
  }, [theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
