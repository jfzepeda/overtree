const { app, BrowserWindow, dialog, shell } = require("electron");
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
    backgroundColor: "#0b0b0b",
    titleBarStyle: "hiddenInset",
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
