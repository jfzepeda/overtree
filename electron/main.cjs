const { app, BrowserWindow, dialog, nativeTheme, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");

const isPackaged = app.isPackaged;
const devUrl = process.env.OVERTREE_DEV_URL || null;

const appRoot = isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

const serverEntry = path.join(appRoot, "dist", "server.cjs");

// macOS apps launched from Finder/Dock inherit a stripped PATH
// (/usr/bin:/bin:/usr/sbin:/sbin) that omits Homebrew, cargo, etc. The
// LaTeX compiler shells out to `tectonic`, which lives in one of those
// dirs, so we restore them before spawning the server. On Windows we add
// the usual install locations of tectonic (cargo, scoop, chocolatey).
function enhancedPath() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const isWin = process.platform === "win32";
  const candidates = isWin
    ? [
        home && path.join(home, ".cargo", "bin"),
        home && path.join(home, "scoop", "shims"),
        process.env.LOCALAPPDATA &&
          path.join(process.env.LOCALAPPDATA, "Programs", "tectonic"),
        process.env.ChocolateyInstall &&
          path.join(process.env.ChocolateyInstall, "bin"),
      ].filter(Boolean)
    : [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    home && path.join(home, ".cargo/bin"),
    "/opt/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].filter(Boolean);
  const current = (process.env.PATH || "").split(path.delimiter);
  const merged = [];
  for (const dir of [...candidates, ...current]) {
    if (dir && !merged.includes(dir) && fs.existsSync(dir)) merged.push(dir);
  }
  return merged.join(path.delimiter);
}

let mainWindow = null;
let serverChild = null;
let serverLogFd = null;
let serverPort = 0;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen({ port: 0, host: "127.0.0.1" }, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = net.connect({ port, host: "127.0.0.1" }, () => {
        sock.end();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`server did not start within ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
    };
    tryConnect();
  });
}

function openServerLog() {
  const dir = app.getPath("logs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "overtree-server.log");
  return { fd: fs.openSync(file, "a"), file };
}

async function startServer() {
  const port = await findFreePort();
  const { fd, file } = openServerLog();
  serverLogFd = fd;

  const child = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    env: {
      ...process.env,
      PATH: enhancedPath(),
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      OVERTREE_BUNDLE_ROOT: appRoot,
    },
    stdio: ["ignore", fd, fd],
  });

  child.on("exit", (code, signal) => {
    if (!app.isQuitting) {
      console.error(`server exited unexpectedly (code=${code} signal=${signal})`);
    }
  });

  serverChild = child;

  try {
    await waitForServer(port);
  } catch (err) {
    dialog.showErrorBox(
      "Overtree failed to start",
      `${err.message}\n\nLog: ${file}`,
    );
    app.quit();
    throw err;
  }

  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
    // The page draws its own draggable title strip (.titlebar in globals.css);
    // keep the traffic lights vertically centred inside it.
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 10 },
    // Windows/Linux: keep the native min/max/close buttons over our title strip.
    ...(process.platform !== "darwin" && {
      titleBarOverlay: {
        color: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
        symbolColor: nativeTheme.shouldUseDarkColors ? "#d4d4d8" : "#3f3f46",
        height: 32,
      },
    }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const target = devUrl || `http://127.0.0.1:${port}`;
  mainWindow.loadURL(target);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    if (devUrl) {
      createWindow(0);
    } else {
      serverPort = await startServer();
      createWindow(serverPort);
    }
  } catch (err) {
    console.error("startup failed", err);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(serverPort);
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (serverChild && !serverChild.killed) {
    try {
      serverChild.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (serverChild && !serverChild.killed) {
        try {
          serverChild.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 3000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (serverLogFd != null) {
    try {
      fs.closeSync(serverLogFd);
    } catch {
      /* ignore */
    }
    serverLogFd = null;
  }
});
