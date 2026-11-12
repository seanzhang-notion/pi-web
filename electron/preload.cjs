/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Expose safe platform APIs to renderer if needed
contextBridge.exposeInMainWorld("piElectron", {
  isMacApp: true,
  platform: process.platform,
  setBadge: (count) => {
    ipcRenderer.send("electron:set-badge", count);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  // Listen for menu shortcuts triggered from native macOS menu
  ipcRenderer.on("electron:open-settings", () => {
    const settingsButton = document.querySelector(
      'button[aria-label="Settings"], button[aria-label="设置"], button[aria-label="設定"]'
    );
    if (settingsButton instanceof HTMLElement) {
      settingsButton.click();
    }
  });

  ipcRenderer.on("electron:new-session", () => {
    // Look for new session link or button in sidebar
    const newSessionBtn = document.querySelector(
      'a[href="/"], button[aria-label="New session"], button[aria-label="新建会话"], button[aria-label="新建工作階段"]'
    );
    if (newSessionBtn instanceof HTMLElement) {
      newSessionBtn.click();
    } else {
      window.location.href = "/";
    }
  });

  // Watch for favicon badge updates to mirror them in macOS Dock
  const iconLink = document.querySelector('link[rel="icon"]');
  if (iconLink) {
    const observer = new MutationObserver(() => {
      const href = iconLink.getAttribute("href") || "";
      if (href.startsWith("data:image/png;base64,")) {
        ipcRenderer.send("electron:set-badge", "•");
      } else {
        ipcRenderer.send("electron:set-badge", "");
      }
    });
    observer.observe(iconLink, { attributes: true, attributeFilter: ["href"] });
  }
});
