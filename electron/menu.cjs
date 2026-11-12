/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { app, Menu, shell } = require("electron");

function buildAppMenu(mainWindow) {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: `About ${app.name}` },
              { type: "separator" },
              {
                label: "Preferences...",
                accelerator: "CmdOrCtrl+,",
                click: () => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("electron:open-settings");
                  }
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide", label: `Hide ${app.name}` },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit", label: `Quit ${app.name}` },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Session",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("electron:new-session");
            }
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Pi Web Documentation",
          click: async () => {
            await shell.openExternal("https://github.com/agegr/pi-web#readme");
          },
        },
        {
          label: "Pi Coding Agent Documentation",
          click: async () => {
            await shell.openExternal("https://github.com/earendil-works/pi");
          },
        },
        {
          label: "Report an Issue...",
          click: async () => {
            await shell.openExternal("https://github.com/agegr/pi-web/issues");
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = {
  buildAppMenu,
};
