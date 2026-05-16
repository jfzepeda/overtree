import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { loadSettings } from "./lib/core/settings";
import { getAllLanIps } from "./lib/lan";
import { flushAllRooms } from "./lib/yjs/doc-manager";

const dev = process.env.NODE_ENV !== "production";

async function main() {
  const settings = await loadSettings();
  const port = Number(process.env.PORT ?? settings.port);
  const hostname = "0.0.0.0";

  // Force webpack — custom-server + Turbopack hangs hydration in Next 16.
  // (Per next/dist/server/next.js: must pass webpack:true; turbopack:false alone leaves it on "auto".)
  const app = next({
    dev,
    hostname,
    port,
    webpack: true,
  } as Parameters<typeof next>[0]);
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("request error", err);
      res.statusCode = 500;
      res.end("internal error");
    });
  });

  const yjsWss = new WebSocketServer({ noServer: true });
  const nextUpgradeHandler = app.getUpgradeHandler();

  httpServer.on("upgrade", async (req, socket, head) => {
    socket.on("error", () => {
      /* swallow noisy resets from HMR / probe clients */
    });
    const url = req.url ?? "";
    // Non-Yjs upgrades (e.g. Next.js HMR `/_next/webpack-hmr`) must reach Next,
    // otherwise the dev client refuses to hydrate the page.
    if (!url.startsWith("/_yjs/")) {
      try {
        await nextUpgradeHandler(req, socket as never, head);
      } catch (err) {
        if (
          (err as NodeJS.ErrnoException)?.code !== "ECONNRESET"
        ) {
          console.error("next upgrade error", err);
        }
      }
      return;
    }
    try {
      const { handleYjsConnection, authorizeYjsRequest } = await import(
        "./lib/yjs/ws-server"
      );
      const auth = await authorizeYjsRequest(req);
      if (!auth.ok) {
        socket.write(`HTTP/1.1 401 Unauthorized\r\n\r\n`);
        socket.destroy();
        return;
      }
      yjsWss.handleUpgrade(req, socket, head, (ws) => {
        handleYjsConnection(ws, req, auth).catch((e) => {
          console.error("yjs upgrade error", e);
          ws.close();
        });
      });
    } catch (err) {
      console.error("upgrade error", err);
      socket.destroy();
    }
  });

  httpServer.listen(port, hostname, () => {
    const ips = getAllLanIps();
    console.log("\n  Overtree is up.\n");
    console.log(`  Local:    http://localhost:${port}`);
    for (const ip of ips) console.log(`  Network:  http://${ip}:${port}`);
    console.log("\n  Settings:", settings.rootDir);
    console.log("");
  });

  // Flush every in-memory Y.Doc to disk before the process exits. Without this,
  // edits made within the per-file flush debounce window (or never auto-saved
  // because the user closed the tab) are lost on `tsx watch` restarts, deploys,
  // and Ctrl+C in dev.
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n  Received ${signal}, flushing rooms…`);
    try {
      await flushAllRooms();
    } catch (err) {
      console.error("flushAllRooms failed during shutdown", err);
    }
    httpServer.close(() => process.exit(0));
    // Safety net: if close hangs (open WS connections), force-exit after 2s.
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("server boot failed", err);
  process.exit(1);
});
