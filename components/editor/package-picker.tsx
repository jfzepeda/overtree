"use client";

import { useEffect, useMemo, useState } from "react";
import { CTAN_PACKAGES } from "@/lib/editor/ctan-packages";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Returns the set of package names currently present in the active doc preamble. */
  alreadyInstalled: Set<string>;
  /** Insert \usepackage{name} into the editor. The caller decides where (preamble vs cursor). */
  onInsert: (name: string) => void;
};

export function PackagePicker({ open, onClose, alreadyInstalled, onInsert }: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CTAN_PACKAGES;
    return CTAN_PACKAGES.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-h-[70vh] rounded-md border border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-zinc-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packages (tikz, biblatex, hyperref…)"
            className="w-full bg-transparent outline-none text-sm placeholder-zinc-600"
          />
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-zinc-600">No matching packages.</div>
          ) : (
            filtered.map((p) => {
              const installed = alreadyInstalled.has(p.name);
              return (
                <button
                  key={p.name}
                  onClick={() => {
                    if (installed) return;
                    onInsert(p.name);
                    onClose();
                  }}
                  disabled={installed}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-zinc-200">{p.name}</code>
                    {installed && (
                      <span className="text-[10px] uppercase tracking-wide text-emerald-500/80">
                        installed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">{p.description}</div>
                </button>
              );
            })
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-zinc-800 text-[10px] text-zinc-600 flex items-center justify-between">
          <span>{filtered.length} packages</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
