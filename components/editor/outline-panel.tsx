"use client";

import { useMemo } from "react";
import { parseOutline } from "@/lib/editor/outline";

type Props = {
  text: string;
  onJump: (line: number) => void;
};

const INDENT_PX = [0, 8, 16, 24, 32, 40, 48];

export function OutlinePanel({ text, onJump }: Props) {
  const nodes = useMemo(() => parseOutline(text), [text]);

  return (
    <div className="h-full flex flex-col bg-[var(--panel)] text-sm">
      <div className="px-3 py-2 border-b border-zinc-800">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Outline</span>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin py-1">
        {nodes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-zinc-600">
            No sections. Add <code>\section{"{...}"}</code> to populate.
          </div>
        ) : (
          nodes.map((n, i) => (
            <button
              key={`${n.line}-${i}`}
              onClick={() => onJump(n.line)}
              style={{ paddingLeft: 8 + (INDENT_PX[n.level] ?? 56) }}
              className="w-full text-left pr-2 py-1 hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100 truncate"
              title={`Line ${n.line}`}
            >
              <span className="text-zinc-500 mr-1.5">{symbolForLevel(n.level)}</span>
              <span>{n.title || <em className="text-zinc-600">untitled</em>}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function symbolForLevel(level: number): string {
  switch (level) {
    case 0:
      return "§";
    case 1:
      return "❐";
    case 2:
      return "▌";
    case 3:
      return "▎";
    case 4:
      return "·";
    default:
      return " ";
  }
}
