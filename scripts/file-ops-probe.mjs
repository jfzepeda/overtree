// Integration probe for file-tree operations against a running dev server
// (bun run dev). Creates a throwaway project, exercises create/mkdir/rename/
// delete via the API while a Yjs client is editing, then deletes the project.
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = "http://localhost:3737";
const root = path.join(os.homedir(), "Documents/Overtree/projects");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};
const exists = (p) => fs.access(p).then(() => true, () => false);

const { project } = await (await fetch(`${BASE}/api/projects`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "file-ops-probe", template: "blank" }),
})).json();
const id = project.id;
const dir = path.join(root, id);
const op = (body) => fetch(`${BASE}/api/files/${id}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const joinRes = await fetch(`${BASE}/api/join/${id}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Probe" }),
});
const cookie = `overtree_session=${joinRes.headers.get("set-cookie").match(/overtree_session=([^;]+)/)[1]}`;

function connect(filePath) {
  const room = `${id}:${Buffer.from(filePath).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  const ws = new WebSocket(`ws://localhost:3737/_yjs/${room}`, { headers: { Cookie: cookie } });
  ws.binaryType = "arraybuffer";
  const doc = new Y.Doc();
  doc.on("update", (u, origin) => {
    if (origin === ws || ws.readyState !== ws.OPEN) return;
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 0);
    syncProtocol.writeUpdate(e, u);
    ws.send(encoding.toUint8Array(e));
  });
  return new Promise((resolve, reject) => {
    let synced = false;
    ws.on("error", reject);
    ws.on("open", () => {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, 0);
      syncProtocol.writeSyncStep1(e, doc);
      ws.send(encoding.toUint8Array(e));
    });
    ws.on("message", (raw) => {
      const dec = decoding.createDecoder(new Uint8Array(raw));
      if (decoding.readVarUint(dec) !== 0) return;
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, 0);
      syncProtocol.readSyncMessage(dec, e, doc, ws);
      if (encoding.length(e) > 1) ws.send(encoding.toUint8Array(e));
      if (!synced) { synced = true; setTimeout(() => resolve({ ws, text: doc.getText("content") }), 300); }
    });
  });
}

try {
  // create / mkdir / guards
  check("create a.tex", (await op({ op: "create", path: "a.tex", content: "" })).ok);
  await fs.writeFile(path.join(dir, "a.tex"), "keep me");
  check("create existing a.tex is refused", (await op({ op: "create", path: "a.tex", content: "" })).status === 400);
  check("existing a.tex not clobbered", (await fs.readFile(path.join(dir, "a.tex"), "utf8")) === "keep me");
  check("mkdir sec", (await op({ op: "mkdir", path: "sec" })).ok && await exists(path.join(dir, "sec")));
  check("move a.tex -> sec/a.tex", (await op({ op: "rename", from: "a.tex", to: "sec/a.tex" })).ok
    && await exists(path.join(dir, "sec/a.tex")) && !(await exists(path.join(dir, "a.tex"))));
  check("move folder into itself refused", (await op({ op: "rename", from: "sec", to: "sec/sec" })).status === 400);
  await op({ op: "create", path: "b.tex", content: "" });
  check("rename onto existing file refused", (await op({ op: "rename", from: "b.tex", to: "sec/a.tex" })).status === 400);

  // /api/save must reach the WebSocket server's rooms (shared registry)
  const main = await connect("main.tex");
  main.text.insert(main.text.length, "\n% SAVE-PROBE");
  await sleep(150);
  await fetch(`${BASE}/api/save/${id}`, { method: "POST" });
  check("Save flushes live edits immediately", (await fs.readFile(path.join(dir, "main.tex"), "utf8")).includes("SAVE-PROBE"));
  main.ws.close();

  // Rename a folder whose file is open and being edited
  const live = await connect("sec/a.tex");
  live.text.insert(live.text.length, " +EDIT1");
  await sleep(100); // well inside the 800ms flush debounce
  check("rename open folder sec -> chap", (await op({ op: "rename", from: "sec", to: "chap" })).ok);
  check("pending edit carried to new path", (await fs.readFile(path.join(dir, "chap/a.tex"), "utf8")).includes("+EDIT1"));
  live.text.insert(live.text.length, " +LATE");
  await sleep(1500);
  check("old path not resurrected by late edits", !(await exists(path.join(dir, "sec"))));
  live.ws.close();

  // Delete an open file, recreate it empty: must not resurrect old CRDT text
  const del = await connect("b.tex");
  del.text.insert(0, "OLD CONTENT");
  await sleep(1200);
  del.ws.close();
  await fetch(`${BASE}/api/files/${id}/b.tex`, { method: "DELETE" });
  await op({ op: "create", path: "b.tex", content: "" });
  const again = await connect("b.tex");
  check("recreated file starts empty", again.text.toString() === "", JSON.stringify(again.text.toString()));
  again.ws.close();
} finally {
  await fetch(`${BASE}/api/projects/${id}`, { method: "DELETE" });
}
console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);
