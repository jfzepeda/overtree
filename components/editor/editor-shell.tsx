"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import type { CodeMirrorHandle, Peer } from "./yjs-code-mirror";
import { FileTree, type FileNode } from "@/components/file-tree/file-tree";
import { CheckIcon, LoaderIcon, PlayIcon, SaveIcon } from "@/components/icons";
import {
  CompileLog,
  type LogEntry,
} from "@/components/compile-log/compile-log";
import { PresenceBar } from "@/components/presence/presence-bar";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const YjsCodeMirror = dynamic(
  () => import("./yjs-code-mirror").then((m) => m.YjsCodeMirror),
  { ssr: false, loading: () => <div className="h-full bg-zinc-950" /> },
);

import { PdfViewer } from "@/components/pdf-viewer/pdf-viewer";

type ProjectMeta = {
  id: string;
  name: string;
  mainFile: string;
};

type CompileStatus = "idle" | "running" | "ok" | "failed";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type UserInfo = { name: string; color: string };

export function EditorShell({
  project,
  user: initialUser,
}: {
  project: ProjectMeta;
  user: UserInfo;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [activePath, setActivePath] = useState<string>(project.mainFile);
  const [compileStatus, setCompileStatus] = useState<CompileStatus>("idle");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [pdfBust, setPdfBust] = useState(0);
  const [pdfAvailable, setPdfAvailable] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<UserInfo>(initialUser);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [editingName, setEditingName] = useState(false);

  const editorRef = useRef<CodeMirrorHandle | null>(null);
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const reloadTree = useCallback(async () => {
    const r = await fetch(`/api/files/${project.id}`);
    const j = await r.json();
    setTree(j.tree ?? []);
  }, [project.id]);

  useEffect(() => {
    reloadTree();
    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, [project.id, reloadTree]);

  const subscribeCompile = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    setLogEntries([]);
    setCompileStatus("running");
    const es = new EventSource(`/api/compile/${project.id}`);
    sseRef.current = es;
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "log") {
        setLogEntries((prev) => [
          ...prev,
          { kind: "log", text: data.line, stream: data.stream },
        ]);
      } else if (data.type === "error") {
        setLogEntries((prev) => [
          ...prev,
          { kind: "error", line: data.line, text: data.message },
        ]);
      } else if (data.type === "done") {
        setCompileStatus(data.ok ? "ok" : "failed");
        if (data.pdfPath) {
          setPdfAvailable(true);
          setPdfBust(Date.now());
        }
        es.close();
      } else if (data.type === "idle") {
        setCompileStatus("idle");
        es.close();
      }
    };
    es.onerror = () => {
      setCompileStatus("failed");
      es.close();
    };
  }, [project.id]);

  const compile = useCallback(async () => {
    await fetch(`/api/compile/${project.id}`, { method: "POST" });
    subscribeCompile();
  }, [project.id, subscribeCompile]);

  const saveNow = useCallback(async () => {
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    setSaveStatus("saving");
    try {
      const r = await fetch(`/api/save/${project.id}`, { method: "POST" });
      if (!r.ok) throw new Error(`save ${r.status}`);
      setSaveStatus("saved");
      savedFlashTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("error");
      savedFlashTimer.current = setTimeout(() => setSaveStatus("idle"), 2500);
    }
  }, [project.id]);

  function handleSaveNow() {
    // Cmd-S: flush yjs to disk and queue a compile.
    saveNow();
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => compile(), 200);
  }

  useEffect(() => {
    return () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    };
  }, []);

  // window.prompt() throws in Electron, so names come from the tree's inline input.
  async function fileOp(body: Record<string, string>): Promise<string | null> {
    const r = await fetch(`/api/files/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j.error ?? `request failed (${r.status})`;
  }

  async function createEntry(parent: string, name: string, kind: "file" | "dir") {
    const path = parent ? `${parent}/${name}` : name;
    const err = await fileOp(
      kind === "dir" ? { op: "mkdir", path } : { op: "create", path, content: "" },
    );
    if (err) return err;
    await reloadTree();
    if (kind === "file") setActivePath(path);
    return null;
  }

  async function movePath(from: string, to: string) {
    const err = await fileOp({ op: "rename", from, to });
    if (err) return err;
    // Keep the open editor on the file it was showing, now at its new path.
    if (activePath === from) setActivePath(to);
    else if (activePath.startsWith(`${from}/`)) {
      setActivePath(to + activePath.slice(from.length));
    }
    await reloadTree();
    return null;
  }

  async function deletePath(path: string) {
    if (!confirm(`Delete "${path}"?`)) return;
    await fetch(`/api/files/${project.id}/${encodeURI(path)}`, {
      method: "DELETE",
    });
    if (activePath === path || activePath.startsWith(`${path}/`)) {
      setActivePath(project.mainFile);
    }
    reloadTree();
  }

  function jumpToLine(line: number) {
    editorRef.current?.gotoLine(line);
  }

  async function changeName(next: string) {
    setEditingName(false);
    const trimmed = next.trim();
    if (!trimmed || trimmed === user.name) return;
    await fetch("/api/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setUser({ ...user, name: trimmed });
  }

  const pdfSrc = pdfAvailable
    ? `/api/files/${project.id}/output/${project.mainFile.replace(/\.tex$/, ".pdf")}?v=${pdfBust}`
    : null;

  return (
    <div className="h-[calc(100vh-var(--titlebar-h))] flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[var(--panel)]">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/projects"
            className="text-zinc-400 hover:text-zinc-100 text-sm shrink-0"
          >
            ← Projects
          </Link>
          <span className="text-zinc-700 shrink-0">/</span>
          <span className="font-medium truncate">{project.name}</span>
          <span className="text-xs text-zinc-500 truncate">{activePath}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ThemeToggle />
          {editingName ? (
            <input
              autoFocus
              defaultValue={user.name}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") {
                  e.currentTarget.value = user.name; // blur on unmount must not save
                  setEditingName(false);
                }
              }}
              onBlur={(e) => changeName(e.currentTarget.value)}
              className="w-28 text-xs bg-zinc-950 border border-[var(--accent)] rounded px-1 py-0.5 outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-xs text-zinc-500 hover:text-zinc-200"
              title="Change name"
            >
              {user.name}
            </button>
          )}
          <PresenceBar me={user} peers={peers} connected={connected} />
          <button
            onClick={saveNow}
            disabled={saveStatus === "saving"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50 text-zinc-200 text-sm font-medium transition"
            title="Save (Cmd+S)"
          >
            {saveStatus === "saving" ? (
              <LoaderIcon width={12} height={12} />
            ) : saveStatus === "saved" ? (
              <CheckIcon width={12} height={12} />
            ) : (
              <SaveIcon width={12} height={12} />
            )}
            {saveStatus === "saving"
              ? "Guardando…"
              : saveStatus === "saved"
                ? "Guardado"
                : saveStatus === "error"
                  ? "Error"
                  : "Guardar"}
          </button>
          <button
            onClick={compile}
            disabled={compileStatus === "running"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition"
            title="Compile (Cmd+Enter)"
          >
            {compileStatus === "running" ? (
              <LoaderIcon width={12} height={12} />
            ) : (
              <PlayIcon width={12} height={12} />
            )}
            {compileStatus === "running" ? "Compiling…" : "Compile"}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <PanelGroup orientation="horizontal" className="h-full">
          <Panel defaultSize={18} minSize={12}>
            <FileTree
              tree={tree}
              activePath={activePath}
              onOpen={setActivePath}
              onCreate={createEntry}
              onMove={movePath}
              onDelete={deletePath}
            />
          </Panel>
          <PanelResizeHandle className="w-px bg-zinc-800 hover:bg-zinc-700 transition" />
          <Panel defaultSize={45} minSize={20}>
            <PanelGroup orientation="vertical" className="h-full">
              <Panel defaultSize={70} minSize={20}>
                <div className="h-full bg-zinc-950">
                  <YjsCodeMirror
                    projectId={project.id}
                    path={activePath}
                    userName={user.name}
                    userColor={user.color}
                    onSave={handleSaveNow}
                    onCompile={compile}
                    onPeers={setPeers}
                    onConnectionChange={setConnected}
                    onReady={(h) => {
                      editorRef.current = h;
                    }}
                  />
                </div>
              </Panel>
              <PanelResizeHandle className="h-px bg-zinc-800 hover:bg-zinc-700 transition" />
              <Panel defaultSize={30} minSize={10}>
                <CompileLog
                  entries={logEntries}
                  status={compileStatus}
                  onJumpToLine={jumpToLine}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-px bg-zinc-800 hover:bg-zinc-700 transition" />
          <Panel defaultSize={37} minSize={20}>
            <PdfViewer src={pdfSrc} />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
