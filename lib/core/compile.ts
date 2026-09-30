import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { promises as fs } from "node:fs";
import { projectDir } from "./storage";
import { readMeta, touchProject } from "./projects";
import { loadSettings } from "./settings";

export type CompileEvent =
  | { type: "log"; line: string; stream: "stdout" | "stderr" }
  | { type: "error"; line: number; message: string }
  | { type: "done"; ok: boolean; exitCode: number; pdfPath: string | null };

export type CompileError = { line: number; message: string };

export type CompileSession = {
  projectId: string;
  emitter: EventEmitter;
  log: string[];
  errors: CompileError[];
  status: "running" | "ok" | "failed";
  exitCode: number | null;
  pdfPath: string | null;
  startedAt: number;
  finishedAt: number | null;
};

const sessions = new Map<string, CompileSession>();

export function getSession(id: string): CompileSession | undefined {
  return sessions.get(id);
}

export async function compile(id: string): Promise<CompileSession> {
  // Flush any pending Y.Doc edits to disk so we compile the latest content.
  try {
    const { flushProjectDocs } = await import("@/lib/yjs/doc-manager");
    await flushProjectDocs(id);
  } catch {
    /* doc-manager not loaded — nothing to flush */
  }
  const meta = await readMeta(id);
  const cwd = await projectDir(id);
  const outDir = path.join(cwd, "output");
  await fs.mkdir(outDir, { recursive: true });

  const existing = sessions.get(id);
  if (existing && existing.status === "running") {
    return existing;
  }

  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);
  const session: CompileSession = {
    projectId: id,
    emitter,
    log: [],
    errors: [],
    status: "running",
    exitCode: null,
    pdfPath: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  sessions.set(id, session);

  const main = meta.mainFile;
  const args = ["-X", "compile", main, "--outdir", "output", "--keep-logs"];

  const { tectonicPath } = await loadSettings();
  const child = spawn(tectonicPath || process.env.OVERTREE_TECTONIC || "tectonic", args, {
    cwd,
    env: { ...process.env, TECTONIC_NO_COLOR: "1" },
  });

  const handleData =
    (stream: "stdout" | "stderr") =>
    (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        session.log.push(line);
        emitter.emit("event", {
          type: "log",
          line,
          stream,
        } satisfies CompileEvent);
      }
    };

  child.stdout.on("data", handleData("stdout"));
  child.stderr.on("data", handleData("stderr"));

  child.on("error", (err) => {
    session.log.push(`process error: ${err.message}`);
    emitter.emit("event", {
      type: "log",
      line: `process error: ${err.message}`,
      stream: "stderr",
    } satisfies CompileEvent);
  });

  child.on("close", async (code) => {
    session.exitCode = code ?? -1;
    session.finishedAt = Date.now();
    session.errors = parseErrorsFromLog(session.log);
    for (const err of session.errors) {
      emitter.emit("event", {
        type: "error",
        line: err.line,
        message: err.message,
      } satisfies CompileEvent);
    }
    const pdfFile = mainToPdf(main);
    const pdfAbs = path.join(outDir, pdfFile);
    const pdfExists = await fs
      .stat(pdfAbs)
      .then(() => true)
      .catch(() => false);
    session.pdfPath = pdfExists ? `output/${pdfFile}` : null;
    session.status = code === 0 && pdfExists ? "ok" : "failed";
    emitter.emit("event", {
      type: "done",
      ok: session.status === "ok",
      exitCode: session.exitCode ?? -1,
      pdfPath: session.pdfPath,
    } satisfies CompileEvent);
    await touchProject(id).catch(() => {});
  });

  return session;
}

function mainToPdf(main: string): string {
  const base = main.replace(/\.tex$/i, "");
  return `${base}.pdf`;
}

export async function compileAndWait(id: string): Promise<CompileSession> {
  const session = await compile(id);
  if (session.status !== "running") return session;
  return await new Promise<CompileSession>((resolve) => {
    const onEvent = (e: CompileEvent) => {
      if (e.type === "done") {
        session.emitter.off("event", onEvent);
        resolve(session);
      }
    };
    session.emitter.on("event", onEvent);
  });
}

const ERROR_RE = /^!\s*(.+)$/;
const LINE_RE = /^l\.(\d+)\s*(.*)$/;

function parseErrorsFromLog(log: string[]): CompileError[] {
  const out: CompileError[] = [];
  for (let i = 0; i < log.length; i++) {
    const m = log[i].match(ERROR_RE);
    if (!m) continue;
    const message = m[1].trim();
    let line = 0;
    for (let j = i + 1; j < Math.min(log.length, i + 8); j++) {
      const lm = log[j].match(LINE_RE);
      if (lm) {
        line = parseInt(lm[1], 10);
        break;
      }
    }
    out.push({ line, message });
  }
  return out;
}
