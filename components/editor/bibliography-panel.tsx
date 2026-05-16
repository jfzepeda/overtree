"use client";

import { useState } from "react";
import type { BibEntry } from "@/lib/core/bib";
import { PlusIcon } from "@/components/icons";

type Props = {
  bibFiles: { path: string; entries: BibEntry[] }[];
  onInsertCite: (key: string) => void;
  onAddEntry: (path: string, entry: BibEntry) => Promise<void>;
};

export function BibliographyPanel({ bibFiles, onInsertCite, onAddEntry }: Props) {
  const [adding, setAdding] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col bg-[var(--panel)] text-sm">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Bibliography</span>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {bibFiles.length === 0 ? (
          <div className="px-3 py-2 text-xs text-zinc-600">
            No <code>.bib</code> files in this project.
          </div>
        ) : (
          bibFiles.map((bf) => (
            <div key={bf.path}>
              <div className="flex items-center justify-between px-3 py-1.5 text-xs text-zinc-500 bg-zinc-900/50">
                <span className="truncate">{bf.path}</span>
                <button
                  onClick={() => setAdding(bf.path)}
                  className="text-zinc-500 hover:text-zinc-200"
                  title="Add entry"
                >
                  <PlusIcon width={12} height={12} />
                </button>
              </div>
              {bf.entries.length === 0 ? (
                <div className="px-3 py-1 text-xs text-zinc-600">No entries.</div>
              ) : (
                bf.entries.map((e) => (
                  <button
                    key={`${bf.path}:${e.key}`}
                    onClick={() => onInsertCite(e.key)}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100"
                    title={`Insert \\cite{${e.key}}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <code className="text-emerald-400 text-xs">{e.key}</code>
                      <span className="text-xs text-zinc-500 truncate">{e.type}</span>
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {e.fields.title || <em className="text-zinc-600">no title</em>}
                    </div>
                    <div className="text-xs text-zinc-600 truncate">
                      {[e.fields.author, e.fields.year].filter(Boolean).join(" — ")}
                    </div>
                  </button>
                ))
              )}
            </div>
          ))
        )}
      </div>
      {adding !== null && (
        <AddEntryForm
          path={adding}
          onCancel={() => setAdding(null)}
          onSubmit={async (entry) => {
            await onAddEntry(adding, entry);
            setAdding(null);
          }}
        />
      )}
    </div>
  );
}

function AddEntryForm({
  path,
  onCancel,
  onSubmit,
}: {
  path: string;
  onCancel: () => void;
  onSubmit: (e: BibEntry) => Promise<void>;
}) {
  const [type, setType] = useState("article");
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-[420px] rounded-md border border-zinc-800 bg-zinc-950 p-4 space-y-3 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-zinc-300 font-medium">Add entry to {path}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
            >
              <option>article</option>
              <option>book</option>
              <option>incollection</option>
              <option>inproceedings</option>
              <option>techreport</option>
              <option>phdthesis</option>
              <option>mastersthesis</option>
              <option>misc</option>
              <option>online</option>
              <option>unpublished</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Key</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="smith2020"
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Author</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Smith, John and Doe, Jane"
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Year</span>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2024"
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 w-24"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded border border-zinc-800 hover:border-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!key.trim()) return;
              setBusy(true);
              const fields: Record<string, string> = {};
              if (title.trim()) fields.title = title.trim();
              if (author.trim()) fields.author = author.trim();
              if (year.trim()) fields.year = year.trim();
              await onSubmit({
                key: key.trim(),
                type,
                fields,
                raw: "",
              });
              setBusy(false);
            }}
            disabled={busy || !key.trim()}
            className="px-3 py-1.5 text-xs rounded bg-[var(--accent)] hover:bg-blue-500 disabled:opacity-50 text-white"
          >
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
