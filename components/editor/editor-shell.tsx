"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import type { CodeMirrorHandle, Peer } from "./yjs-code-mirror";
import { FileTree, type FileNode } from "@/components/file-tree/file-tree";
import { CheckIcon, LoaderIcon, PlayIcon, PlusIcon, SaveIcon } from "@/components/icons";
import {
  CompileLog,
  type LogEntry,
} from "@/components/compile-log/compile-log";
import { PresenceBar } from "@/components/presence/presence-bar";
import { OutlinePanel } from "./outline-panel";
import { BibliographyPanel } from "./bibliography-panel";
import { PackagePicker } from "./package-picker";
import { parseBib, formatBibEntry, type BibEntry } from "@/lib/core/bib";

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

type SidebarTab = "files" | "outline" | "refs";

type BibFile = { path: string; entries: BibEntry[] };

function collectBibPaths(tree: FileNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.kind === "file" && n.path.endsWith(".bib")) out.push(n.path);
      if (n.kind === "dir" && n.children) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

function collectInstalledPackages(doc: string): Set<string> {
  const out = new Set<string>();
  const re = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => out.add(p));
  }
  return out;
}

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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [docText, setDocText] = useState<string>("");
  const [bibFiles, setBibFiles] = useState<BibFile[]>([]);
  const [packagePickerOpen, setPackagePickerOpen] = useState(false);

  const editorRef = useRef<CodeMirrorHandle | null>(null);
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const bibEntriesRef = useRef<BibEntry[]>([]);

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

  // Load .bib files whenever the tree changes.
  const reloadBibs = useCallback(
    async (currentTree: FileNode[]) => {
      const paths = collectBibPaths(currentTree);
      if (paths.length === 0) {
        setBibFiles([]);
        bibEntriesRef.current = [];
        return;
      }
      const results: BibFile[] = [];
      for (const p of paths) {
        try {
          const r = await fetch(`/api/files/${project.id}/${encodeURI(p)}?raw=1`);
          if (!r.ok) continue;
          const text = await r.text();
          results.push({ path: p, entries: parseBib(text) });
        } catch {
          // ignore
        }
      }
      setBibFiles(results);
      bibEntriesRef.current = results.flatMap((b) => b.entries);
    },
    [project.id],
  );

  useEffect(() => {
    reloadBibs(tree);
  }, [tree, reloadBibs]);

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
    saveNow();
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => compile(), 200);
  }

  useEffect(() => {
    return () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    };
  }, []);

  async function createFile(parent: string) {
    const name = prompt(
      `New file name${parent ? ` inside "${parent}"` : ""}:`,
      "untitled.tex",
    );
    if (!name) return;
    const path = parent ? `${parent}/${name}` : name;
    const r = await fetch(`/api/files/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "create", path, content: "" }),
    });
    if (r.ok) {
      await reloadTree();
      setActivePath(path);
    }
  }

  async function deletePath(path: string) {
    if (!confirm(`Delete "${path}"?`)) return;
    await fetch(`/api/files/${project.id}/${encodeURI(path)}`, {
      method: "DELETE",
    });
    if (activePath === path) setActivePath(project.mainFile);
    reloadTree();
  }

  function jumpToLine(line: number) {
    editorRef.current?.gotoLine(line);
  }

  async function changeName() {
    const next = window.prompt("Your name:", user.name);
    if (!next || !next.trim()) return;
    const trimmed = next.trim();
    await fetch("/api/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setUser({ ...user, name: trimmed });
  }

  const insertCite = useCallback((key: string) => {
    editorRef.current?.insertAtCursor(`\\cite{${key}}`);
  }, []);

  const addBibEntry = useCallback(
    async (path: string, entry: BibEntry) => {
      // Fetch current contents, append entry, PUT back.
      const r = await fetch(`/api/files/${project.id}/${encodeURI(path)}?raw=1`);
      const current = r.ok ? await r.text() : "";
      const next = current.replace(/\s*$/, "") + "\n\n" + formatBibEntry(entry) + "\n";
      await fetch(`/api/files/${project.id}/${encodeURI(path)}`, {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: next,
      });
      await reloadBibs(tree);
    },
    [project.id, reloadBibs, tree],
  );

  const installedPackages = useMemo(
    () => collectInstalledPackages(docText),
    [docText],
  );

  const pdfSrc = pdfAvailable
    ? `/api/files/${project.id}/output/${project.mainFile.replace(/\.tex$/, ".pdf")}?v=${pdfBust}`
    : null;

  // In the packaged macOS app the window uses titleBarStyle "hiddenInset",
  // so the traffic-light buttons overlay the top-left of the header. Pad the
  // header left to clear them (no-op in the browser, where there are none).
  const [isMacElectron, setIsMacElectron] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setIsMacElectron(ua.includes("Electron") && ua.includes("Mac"));
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <header
        className={`flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[var(--panel)] ${
          isMacElectron ? "pl-[78px]" : ""
        }`}
      >
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
          <button
            onClick={() => setPackagePickerOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 text-zinc-300 text-xs transition"
            title="Add LaTeX package"
          >
            <PlusIcon width={12} height={12} />
            Package
          </button>
          <button
            onClick={changeName}
            className="text-xs text-zinc-500 hover:text-zinc-200"
            title="Change name"
          >
            {user.name}
          </button>
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
            <div className="h-full flex flex-col bg-[var(--panel)]">
              <div className="flex border-b border-zinc-800 text-xs">
                <SidebarTabButton
                  active={sidebarTab === "files"}
                  onClick={() => setSidebarTab("files")}
                >
                  Files
                </SidebarTabButton>
                <SidebarTabButton
                  active={sidebarTab === "outline"}
                  onClick={() => setSidebarTab("outline")}
                >
                  Outline
                </SidebarTabButton>
                <SidebarTabButton
                  active={sidebarTab === "refs"}
                  onClick={() => setSidebarTab("refs")}
                  badge={bibFiles.reduce((n, b) => n + b.entries.length, 0) || undefined}
                >
                  Refs
                </SidebarTabButton>
              </div>
              <div className="flex-1 min-h-0">
                {sidebarTab === "files" && (
                  <FileTree
                    tree={tree}
                    activePath={activePath}
                    onOpen={setActivePath}
                    onCreate={createFile}
                    onDelete={deletePath}
                  />
                )}
                {sidebarTab === "outline" && (
                  <OutlinePanel text={docText} onJump={jumpToLine} />
                )}
                {sidebarTab === "refs" && (
                  <BibliographyPanel
                    bibFiles={bibFiles}
                    onInsertCite={insertCite}
                    onAddEntry={addBibEntry}
                  />
                )}
              </div>
            </div>
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
                    onDocChange={setDocText}
                    getBibEntries={() =>
                      bibEntriesRef.current.map((e) => ({
                        key: e.key,
                        title: e.fields.title,
                        author: e.fields.author,
                        year: e.fields.year,
                      }))
                    }
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

      <PackagePicker
        open={packagePickerOpen}
        onClose={() => setPackagePickerOpen(false)}
        alreadyInstalled={installedPackages}
        onInsert={(name) => editorRef.current?.insertUsePackage(name)}
      />
    </div>
  );
}

function SidebarTabButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 uppercase tracking-wide transition ${
        active
          ? "text-zinc-100 border-b border-blue-500 bg-zinc-900/40"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {typeof badge === "number" && badge > 0 && (
          <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-300">{badge}</span>
        )}
      </span>
    </button>
  );
}
