/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { ServerManager } = require("./server-manager.cjs");
const { buildAppMenu } = require("./menu.cjs");

app.name = "Pi Web";

let mainWindow = null;
let serverManager = null;
let isQuitting = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

async function createWindow(serverUrl) {
  const iconPath = path.join(__dirname, "assets", "icon.icns");

  mainWindow = new BrowserWindow({
    title: "Pi Web",
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 520,
    backgroundColor: "#18181b",
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  buildAppMenu(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Intercept navigation to external links and open in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(serverUrl);
}

async function init() {
  serverManager = new ServerManager({
    isPackaged: app.isPackaged,
    appRoot: path.resolve(__dirname, ".."),
  });

  try {
    const { url } = await serverManager.start();
    await createWindow(url);
  } catch (error) {
    console.error("[Electron] Failed to start application:", error);
    app.quit();
  }
}

ipcMain.on("electron:set-badge", (_event, badgeText) => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setBadge(badgeText ? String(badgeText) : "");
  }
});

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    const iconPath = path.join(__dirname, "assets", "icon.icns");
    try {
      app.dock.setIcon(iconPath);
    } catch {
      // Icon will fall back to application bundle icon
    }
  }

  await init();

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else if (serverManager) {
      createWindow(serverManager.getUrl());
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (serverManager) {
    serverManager.stop();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
