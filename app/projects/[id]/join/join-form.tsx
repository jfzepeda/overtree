"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "@/components/icons";

const PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
];

type Props = {
  projectId: string;
  projectName: string;
  isPrivate: boolean;
};

export function JoinForm({ projectId, projectName, isPrivate }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[6]);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.name) setName(j.name);
        if (j.color) setColor(j.color);
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    const r = await fetch(`/api/join/${projectId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color, password }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? "Could not join");
      setSubmitting(false);
      return;
    }
    router.push(`/projects/${projectId}`);
  }

  return (
    <div className="min-h-[calc(100vh-var(--titlebar-h))] flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-[var(--panel)] border border-zinc-800 rounded-xl p-6"
      >
        <h1 className="text-lg font-medium mb-1">Join "{projectName}"</h1>
        <p className="text-zinc-500 text-sm mb-5">
          {isPrivate ? "Private project — password required." : "Pick a name your collaborators will see."}
        </p>

        <label className="block text-sm mb-1 text-zinc-400">Your name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
        />

        <label className="block text-sm mt-4 mb-2 text-zinc-400">
          Cursor color
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={`w-6 h-6 rounded-full transition ${
                c === color ? "ring-2 ring-white" : ""
              }`}
            />
          ))}
        </div>

        {isPrivate && (
          <>
            <label className="block text-sm mt-4 mb-1 text-zinc-400 inline-flex items-center gap-1">
              <LockIcon width={12} height={12} /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Project password"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {submitting ? "Joining…" : "Join project"}
          </button>
        </div>
      </form>
    </div>
  );
}
