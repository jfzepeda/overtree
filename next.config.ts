import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // chokidar v3 pulls in the native fsevents binding; let Node require it at
  // runtime instead of bundling it into route handlers.
  serverExternalPackages: ["chokidar", "fsevents"],
};

export default nextConfig;
