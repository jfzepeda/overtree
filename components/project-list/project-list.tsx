"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderIcon,
  LockIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NewProjectDialog } from "./new-project-dialog";

type Project = {
  id: string;
  name: string;
  mainFile: string;
  createdAt: number;
  updatedAt: number;
  private: boolean;
};

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function reload() {
    setLoading(true);
    const r = await fetch("/api/projects");
    const j = await r.json();
    setProjects(j.projects ?? []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold">Overtree</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Local-first LaTeX editor with LAN collaboration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="inline-flex items-center px-3 py-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition" />
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 text-sm text-zinc-300 transition"
            title="Settings & MCP setup"
          >
            <SettingsIcon /> Settings
          </Link>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-blue-500 text-white text-sm font-medium transition"
          >
            <PlusIcon /> New project
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center">
          <FolderIcon className="mx-auto mb-3 text-zinc-600" width={32} height={32} />
          <p className="text-zinc-400">No projects yet.</p>
          <button
            onClick={() => setOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition"
          >
            <PlusIcon /> Create your first project
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <li
              key={p.id}
              className="group relative border border-zinc-800 rounded-xl p-5 bg-[var(--panel)] hover:border-zinc-600 transition"
            >
              <Link href={`/projects/${p.id}`} className="block">
                <div className="flex items-center gap-2 mb-3 text-zinc-400">
                  <FolderIcon />
                  {p.private && (
                    <LockIcon
                      width={12}
                      height={12}
                      className="text-amber-500"
                    />
                  )}
                </div>
                <h3 className="font-medium truncate">{p.name}</h3>
                <p className="text-xs text-zinc-500 mt-1 truncate">
                  {p.mainFile}
                </p>
                <p className="text-xs text-zinc-600 mt-3">
                  {new Date(p.updatedAt).toLocaleString()}
                </p>
              </Link>
              <button
                onClick={() => onDelete(p.id, p.name)}
                className="absolute top-3 right-3 p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-900 opacity-0 group-hover:opacity-100 transition"
                title="Delete"
              >
                <TrashIcon width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <NewProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          reload();
        }}
      />
    </div>
  );
}
