import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { atomicWrite, readFile, writeFile } from "@/lib/core/files";
import { projectMetaDir, resolveInProject } from "@/lib/core/storage";
import { createHash } from "node:crypto";
import type { WebSocket } from "ws";

/**
 * Persistence ordering: `.tex` flushes BEFORE `.bin`, so on disk the user-facing
 * text is always at least as fresh as the CRDT history snapshot. This makes the
 * reconciliation in `getRoom` (prefer `diskContent` when it differs from the
 * hydrated Y.Text) correct under BOTH cases that cause a mismatch:
 *   - external write to `.tex` (vim / MCP / git) → `.tex` is genuinely newer
 *   - server crash between flushes → `.tex` was flushed but `.bin` wasn't,
 *     so `.tex` is still newer than the `.bin` snapshot.
 * If we flushed `.bin` first instead, a mid-window crash would leave `.bin`
 * ahead of `.tex` and the reconciliation would discard the user's edits.
 */
const FLUSH_DEBOUNCE_MS = 300;
const STATE_FLUSH_DEBOUNCE_MS = 800;
const IDLE_DISPOSE_MS = 5 * 60 * 1000;

async function yjsStateFile(
  projectId: string,
  filePath: string,
): Promise<string> {
  const meta = await projectMetaDir(projectId);
  const safe = Buffer.from(filePath, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return path.join(meta, "yjs", `${safe}.bin`);
}

export type Room = {
  key: string;
  projectId: string;
  filePath: string;
  doc: Y.Doc;
  ytext: Y.Text;
  awareness: Awareness;
  connections: Set<WebSocket>;
  lastDiskHash: string;
  pendingFlushHash: string | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  stateFlushTimer: ReturnType<typeof setTimeout> | null;
  watcher: FSWatcher | null;
  disposeTimer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();
const pendingRooms = new Map<string, Promise<Room>>();

function roomKey(projectId: string, filePath: string): string {
  return `${projectId}::${filePath}`;
}

function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

export async function getRoom(
  projectId: string,
  filePath: string,
): Promise<Room> {
  const key = roomKey(projectId, filePath);
  const existing = rooms.get(key);
  if (existing) {
    if (existing.disposeTimer) {
      clearTimeout(existing.disposeTimer);
      existing.disposeTimer = null;
    }
    return existing;
  }
  // Coalesce concurrent inits for the same room. Without this, two WS
  // connections arriving in the same microtask window each build their own
  // Y.Doc and the second `rooms.set` orphans the first, leaving one client
  // wired to an isolated doc.
  const inFlight = pendingRooms.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      return await initRoom(projectId, filePath, key);
    } finally {
      pendingRooms.delete(key);
    }
  })();
  pendingRooms.set(key, promise);
  return promise;
}

async function initRoom(
  projectId: string,
  filePath: string,
  key: string,
): Promise<Room> {
  const doc = new Y.Doc();
  const ytext = doc.getText("content");

  const stateFile = await yjsStateFile(projectId, filePath);
  let seededFromState = false;
  try {
    const persisted = await fs.readFile(stateFile);
    Y.applyUpdate(doc, new Uint8Array(persisted), "disk-sync");
    seededFromState = true;
  } catch {
    /* no persisted state yet */
  }
  const diskContent = await readFile(projectId, filePath).catch(() => "");
  if (!seededFromState) {
    if (diskContent) {
      doc.transact(() => ytext.insert(0, diskContent), "disk-sync");
    }
  } else if (ytext.toString() !== diskContent && diskContent) {
    // Disk differs from the rehydrated CRDT. With .tex-first flushing this
    // means the disk is the authoritative version (either edited externally
    // or surviving a crash that lost the in-progress .bin flush).
    doc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, diskContent);
    }, "disk-sync");
  }

  const awareness = new Awareness(doc);
  const room: Room = {
    key,
    projectId,
    filePath,
    doc,
    ytext,
    awareness,
    connections: new Set(),
    lastDiskHash: hashContent(ytext.toString()),
    pendingFlushHash: null,
    flushTimer: null,
    stateFlushTimer: null,
    watcher: null,
    disposeTimer: null,
  };

  doc.on("update", (_update, origin) => {
    // .bin captures the CRDT state and must follow every doc mutation —
    // including disk-sync ones (chokidar pulled new content in, the CRDT
    // gained an op for it). .tex is the user-facing text; skip its scheduler
    // when the update originated from disk because the file already has that
    // content.
    scheduleStateFlush(room);
    if (origin === "disk-sync") return;
    scheduleFlush(room);
  });

  const abs = await resolveInProject(projectId, filePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const watcher = chokidar.watch(abs, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });
  watcher.on("change", () => onDiskChange(room).catch(() => {}));
  watcher.on("add", () => onDiskChange(room).catch(() => {}));
  room.watcher = watcher;

  rooms.set(key, room);
  return room;
}

function scheduleFlush(room: Room) {
  if (room.flushTimer) clearTimeout(room.flushTimer);
  room.flushTimer = setTimeout(() => flushToDisk(room), FLUSH_DEBOUNCE_MS);
}

function scheduleStateFlush(room: Room) {
  if (room.stateFlushTimer) clearTimeout(room.stateFlushTimer);
  room.stateFlushTimer = setTimeout(
    () => flushYjsState(room),
    STATE_FLUSH_DEBOUNCE_MS,
  );
}

async function flushYjsState(room: Room) {
  room.stateFlushTimer = null;
  try {
    const file = await yjsStateFile(room.projectId, room.filePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const update = Y.encodeStateAsUpdate(room.doc);
    await atomicWrite(file, Buffer.from(update));
  } catch (err) {
    console.error("yjs state flush failed", room.key, err);
  }
}

async function flushToDisk(room: Room) {
  room.flushTimer = null;
  const content = room.ytext.toString();
  const hash = hashContent(content);
  if (hash === room.lastDiskHash) return;
  room.pendingFlushHash = hash;
  try {
    await writeFile(room.projectId, room.filePath, content);
    room.lastDiskHash = hash;
  } catch (err) {
    console.error("flush failed", room.key, err);
  } finally {
    room.pendingFlushHash = null;
  }
}

async function onDiskChange(room: Room) {
  let content: string;
  try {
    content = await readFile(room.projectId, room.filePath);
  } catch {
    return;
  }
  const hash = hashContent(content);
  if (hash === room.lastDiskHash) return; // self-write
  if (hash === room.pendingFlushHash) return; // mid-flush echo
  room.lastDiskHash = hash;
  room.doc.transact(() => {
    room.ytext.delete(0, room.ytext.length);
    room.ytext.insert(0, content);
  }, "disk-sync");
}

export function attachConnection(room: Room, ws: WebSocket) {
  room.connections.add(ws);
  if (room.disposeTimer) {
    clearTimeout(room.disposeTimer);
    room.disposeTimer = null;
  }
}

export function detachConnection(room: Room, ws: WebSocket) {
  room.connections.delete(ws);
  if (room.connections.size === 0) {
    room.disposeTimer = setTimeout(() => disposeRoom(room), IDLE_DISPOSE_MS);
  }
}

async function disposeRoom(room: Room) {
  if (room.connections.size > 0) return;
  if (room.flushTimer) {
    clearTimeout(room.flushTimer);
    await flushToDisk(room);
  }
  if (room.stateFlushTimer) {
    clearTimeout(room.stateFlushTimer);
    await flushYjsState(room);
  }
  if (room.watcher) {
    await room.watcher.close().catch(() => {});
  }
  room.doc.destroy();
  rooms.delete(room.key);
}

/**
 * Flush all in-memory Y.Docs belonging to a project: both .tex and .bin so
 * disk is fully consistent before the call returns. Used by /api/save.
 */
export async function flushProjectDocs(projectId: string): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const room of rooms.values()) {
    if (room.projectId !== projectId) continue;
    tasks.push(flushRoomNow(room));
  }
  await Promise.all(tasks);
}

/**
 * Flush every live room — .tex then .bin — and await completion. Called from
 * the server's SIGINT/SIGTERM handler so a deploy/restart never strands edits
 * that only existed in memory.
 */
export async function flushAllRooms(): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const room of rooms.values()) {
    tasks.push(flushRoomNow(room));
  }
  await Promise.all(tasks);
}

async function flushRoomNow(room: Room): Promise<void> {
  if (room.flushTimer) {
    clearTimeout(room.flushTimer);
    room.flushTimer = null;
  }
  if (room.stateFlushTimer) {
    clearTimeout(room.stateFlushTimer);
    room.stateFlushTimer = null;
  }
  await flushToDisk(room);
  await flushYjsState(room);
}

/** Apply external (e.g. MCP HTTP) write so connected editors see the change. */
export async function applyExternalUpdate(
  projectId: string,
  filePath: string,
  newContent: string,
): Promise<void> {
  const key = roomKey(projectId, filePath);
  const room = rooms.get(key);
  if (!room) return;
  const hash = hashContent(newContent);
  if (hash === room.lastDiskHash) return;
  room.lastDiskHash = hash;
  room.doc.transact(() => {
    room.ytext.delete(0, room.ytext.length);
    room.ytext.insert(0, newContent);
  }, "disk-sync");
}
