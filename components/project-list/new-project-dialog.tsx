"use client";

import { useEffect, useState } from "react";
import { XIcon } from "@/components/icons";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
};

export function NewProjectDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("article");
  const [templates, setTemplates] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setName("");
      setTemplate("article");
      setIsPrivate(false);
      setPassword("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (isPrivate && password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    setSubmitting(true);
    setError(null);
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, template, private: isPrivate, password }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error ?? "Could not create project");
      setSubmitting(false);
      return;
    }
    onCreated(j.project.id);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={submit}
        className="bg-[var(--panel)] border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">New project</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200"
          >
            <XIcon />
          </button>
        </div>

        <label className="block text-sm mb-1 text-zinc-400">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My paper"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
        />

        <label className="block text-sm mt-4 mb-1 text-zinc-400">
          Template
        </label>
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 mt-4 text-sm text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          Private (require password)
        </label>

        {isPrivate && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Project password"
            className="w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
          />
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
