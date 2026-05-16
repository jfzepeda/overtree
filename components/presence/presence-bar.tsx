"use client";

import type { Peer } from "@/components/editor/yjs-code-mirror";

type Props = {
  me: { name: string; color: string };
  peers: Peer[];
  connected: boolean;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function PresenceBar({ me, peers, connected }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-600"}`}
        title={connected ? "Live" : "Disconnected"}
      />
      <Avatar name={me.name} color={me.color} self />
      {peers.map((p) => (
        <Avatar key={p.clientId} name={p.name} color={p.color} typing={p.typing} />
      ))}
    </div>
  );
}

function Avatar({
  name,
  color,
  self,
  typing,
}: {
  name: string;
  color: string;
  self?: boolean;
  typing?: boolean;
}) {
  const titleParts = [name];
  if (self) titleParts.push("(you)");
  if (typing) titleParts.push("· typing…");
  return (
    <div className="relative">
      <div
        title={titleParts.join(" ")}
        style={{ background: color }}
        className="w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center text-white border border-zinc-900 ring-2 ring-zinc-900/0 hover:ring-zinc-700 transition"
      >
        {initials(name)}
      </div>
      {typing && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-zinc-900 animate-pulse"
          title="typing…"
        />
      )}
    </div>
  );
}
