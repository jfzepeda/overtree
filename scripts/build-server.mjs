import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const externals = [
  "next",
  "next/*",
  "@next/*",
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
  "yjs",
  "y-protocols",
  "y-protocols/*",
  "y-websocket",
  "ws",
  "chokidar",
  "fsevents",
  "sharp",
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/sdk/*",
  "lib0",
  "lib0/*",
];

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  tsconfig: path.join(root, "tsconfig.json"),
  external: externals,
  logLevel: "info",
};

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(root, "server.ts")],
    outfile: path.join(root, "dist", "server.cjs"),
  }),
  build({
    ...common,
    entryPoints: [path.join(root, "mcp-server", "stdio.ts")],
    outfile: path.join(root, "dist", "mcp-stdio.cjs"),
  }),
]);

console.log("✓ built dist/server.cjs and dist/mcp-stdio.cjs");
