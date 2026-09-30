"use client";

import { useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

export type FileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
  children?: FileNode[];
};

/** Resolves to an error message, or null on success. */
type Action = Promise<string | null>;

type Props = {
  tree: FileNode[];
  activePath?: string;
  onOpen: (path: string) => void;
  onCreate: (parent: string, name: string, kind: "file" | "dir") => Action;
  onMove: (from: string, to: string) => Action;
  onDelete: (path: string) => void;
};

// Inline editor state: creating a new entry inside `parent`, or renaming `path`.
type Editing =
  | { mode: "create"; kind: "file" | "dir"; parent: string }
  | { mode: "rename"; path: string; name: string };

const DRAG_MIME = "application/x-overtree-path";

const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);

type Ctx = Props & {
  collapsed: Set<string>;
  toggle: (path: string) => void;
  editing: Editing | null;
  startCreate: (parent: string, kind: "file" | "dir") => void;
  startRename: (node: FileNode) => void;
  commit: (value: string) => void;
  cancel: () => void;
  dropTarget: string | null;
  setDropTarget: (dir: string | null) => void;
  drop: (e: React.DragEvent, dir: string) => void;
};

export function FileTree(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function startCreate(parent: string, kind: "file" | "dir") {
    setError(null);
    if (parent) setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parent);
      return next;
    });
    setEditing({ mode: "create", kind, parent });
  }

  function startRename(node: FileNode) {
    setError(null);
    setEditing({ mode: "rename", path: node.path, name: node.name });
  }

  async function run(action: Action) {
    const err = await action;
    setError(err);
  }

  function commit(value: string) {
    const current = editing;
    setEditing(null);
    const name = value.trim();
    if (!current || !name) return;
    if (current.mode === "create") {
      run(props.onCreate(current.parent, name, current.kind));
    } else if (name !== current.name) {
      if (name.includes("/")) {
        setError("Names can't contain “/” — drag to move instead.");
        return;
      }
      run(props.onMove(current.path, join(parentOf(current.path), name)));
    }
  }

  function drop(e: React.DragEvent, dir: string) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const from = e.dataTransfer.getData(DRAG_MIME);
    if (!from) return;
    const to = join(dir, baseName(from));
    if (to === from) return;
    if (dir === from || dir.startsWith(`${from}/`)) {
      setError("Can't move a folder into itself.");
      return;
    }
    run(props.onMove(from, to));
  }

  const ctx: Ctx = {
    ...props,
    collapsed,
    toggle,
    editing,
    startCreate,
    startRename,
    commit,
    cancel: () => setEditing(null),
    dropTarget,
    setDropTarget,
    drop,
  };

  return (
    <div className="h-full flex flex-col bg-[var(--panel)] text-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800">
        <span className="text-xs uppercase tracking-wide text-zinc-500 flex-1">
          Files
        </span>
        <button
          onClick={() => startCreate("", "file")}
          title="New file"
          className="text-zinc-500 hover:text-zinc-200"
        >
          <PlusIcon width={14} height={14} />
        </button>
        <button
          onClick={() => startCreate("", "dir")}
          title="New folder"
          className="text-zinc-500 hover:text-zinc-200"
        >
          <FolderPlusIcon width={14} height={14} />
        </button>
      </div>
      <div
        className={cn(
          "flex-1 overflow-auto scrollbar-thin py-1",
          dropTarget === "" && "bg-[var(--accent)]/10",
        )}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          setDropTarget("");
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDropTarget(null);
        }}
        onDrop={(e) => drop(e, "")}
      >
        {editing?.mode === "create" && editing.parent === "" && (
          <NameInput ctx={ctx} depth={0} kind={editing.kind} initial="" />
        )}
        {props.tree.map((n) => (
          <Node key={n.path} node={n} depth={0} ctx={ctx} />
        ))}
      </div>
      {error && (
        <div
          className="px-3 py-2 border-t border-zinc-800 text-xs text-red-400 cursor-pointer"
          onClick={() => setError(null)}
          title="Dismiss"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function NameInput({
  ctx,
  depth,
  kind,
  initial,
}: {
  ctx: Ctx;
  depth: number;
  kind: "file" | "dir";
  initial: string;
}) {
  const Icon = kind === "dir" ? FolderIcon : FileIcon;
  // Enter/Escape unmount the input, which can also fire blur — settle once.
  const settled = useRef(false);
  const settle = (fn: () => void) => {
    if (settled.current) return;
    settled.current = true;
    fn();
  };
  return (
    <div
      style={{ paddingLeft: 8 + depth * 12 }}
      className="flex items-center gap-1 pr-2 py-0.5"
    >
      <span className="w-3" />
      <Icon
        width={14}
        height={14}
        className={kind === "dir" ? "text-amber-400/80" : "text-zinc-500"}
      />
      <input
        autoFocus
        defaultValue={initial}
        placeholder={kind === "dir" ? "folder name" : "file.tex"}
        onFocus={(e) => {
          // Select the name without its extension, like Finder/VS Code.
          const dot = initial.lastIndexOf(".");
          e.currentTarget.setSelectionRange(0, dot > 0 ? dot : initial.length);
        }}
        onKeyDown={(e) => {
          const value = e.currentTarget.value;
          if (e.key === "Enter") settle(() => ctx.commit(value));
          else if (e.key === "Escape") settle(ctx.cancel);
        }}
        onBlur={(e) => {
          const value = e.currentTarget.value;
          settle(() => ctx.commit(value));
        }}
        className="flex-1 min-w-0 bg-zinc-950 border border-[var(--accent)] rounded px-1 py-0.5 text-sm outline-none"
      />
    </div>
  );
}

function Node({ node, depth, ctx }: { node: FileNode; depth: number; ctx: Ctx }) {
  const indent = { paddingLeft: 8 + depth * 12 };
  const isActive = node.path === ctx.activePath;
  const isDir = node.kind === "dir";
  const open = isDir && !ctx.collapsed.has(node.path);
  const dropDir = isDir ? node.path : parentOf(node.path);

  if (ctx.editing?.mode === "rename" && ctx.editing.path === node.path) {
    return (
      <>
        <NameInput ctx={ctx} depth={depth} kind={node.kind} initial={node.name} />
        {open && <Children node={node} depth={depth} ctx={ctx} />}
      </>
    );
  }

  const actionClass = "opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-200";

  return (
    <div>
      <div
        style={indent}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, node.path);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => ctx.setDropTarget(null)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.stopPropagation();
          ctx.setDropTarget(dropDir);
        }}
        onDrop={(e) => ctx.drop(e, dropDir)}
        onClick={() => (isDir ? ctx.toggle(node.path) : ctx.onOpen(node.path))}
        onDoubleClick={() => ctx.startRename(node)}
        className={cn(
          "group flex items-center gap-1 pr-2 py-1 cursor-pointer select-none",
          isActive ? "bg-zinc-800 text-zinc-50" : "hover:bg-zinc-900",
          isDir && ctx.dropTarget === node.path && "bg-[var(--accent)]/20",
        )}
      >
        {isDir ? (
          open ? (
            <ChevronDownIcon width={12} height={12} />
          ) : (
            <ChevronRightIcon width={12} height={12} />
          )
        ) : (
          <span className="w-3" />
        )}
        {isDir ? (
          <FolderIcon width={14} height={14} className="text-amber-400/80" />
        ) : (
          <FileIcon width={14} height={14} className="text-zinc-500" />
        )}
        <span className="truncate flex-1">{node.name}</span>
        {isDir && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                ctx.startCreate(node.path, "file");
              }}
              className={actionClass}
              title="New file in this folder"
            >
              <PlusIcon width={12} height={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                ctx.startCreate(node.path, "dir");
              }}
              className={actionClass}
              title="New folder in this folder"
            >
              <FolderPlusIcon width={12} height={12} />
            </button>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            ctx.startRename(node);
          }}
          className={actionClass}
          title="Rename"
        >
          <PencilIcon width={12} height={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            ctx.onDelete(node.path);
          }}
          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
          title={isDir ? "Delete folder" : "Delete"}
        >
          <TrashIcon width={12} height={12} />
        </button>
      </div>
      {open && <Children node={node} depth={depth} ctx={ctx} />}
    </div>
  );
}

function Children({ node, depth, ctx }: { node: FileNode; depth: number; ctx: Ctx }) {
  return (
    <>
      {ctx.editing?.mode === "create" && ctx.editing.parent === node.path && (
        <NameInput ctx={ctx} depth={depth + 1} kind={ctx.editing.kind} initial="" />
      )}
      {(node.children ?? []).map((c) => (
        <Node key={c.path} node={c} depth={depth + 1} ctx={ctx} />
      ))}
    </>
  );
}
