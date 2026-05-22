import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // doc-manager (imported by some API routes) pulls in chokidar, which has a
  // native fsevents binding Turbopack can't place in a bundle. Keep these as
  // runtime requires resolved from node_modules (bundled in the Electron app).
  serverExternalPackages: ["chokidar", "fsevents"],
};

export default nextConfig;
