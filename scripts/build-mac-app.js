#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { packager } = require("@electron/packager");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));

function ensureIcon() {
  const iconPath = path.join(rootDir, "electron", "assets", "icon.icns");
  if (fs.existsSync(iconPath)) return iconPath;

  console.log("Generating macOS icon.icns from public/icons/icon-512.png...");
  const iconsetDir = path.join(rootDir, "electron", "assets", "icon.iconset");
  fs.mkdirSync(iconsetDir, { recursive: true });

  const sizes = [16, 32, 64, 128, 256, 512];
  for (const size of sizes) {
    execSync(`sips -z ${size} ${size} public/icons/icon-512.png --out ${iconsetDir}/icon_${size}x${size}.png`, {
      cwd: rootDir,
      stdio: "ignore",
    });
    if (size <= 256) {
      execSync(`sips -z ${size * 2} ${size * 2} public/icons/icon-512.png --out ${iconsetDir}/icon_${size}x${size}@2x.png`, {
        cwd: rootDir,
        stdio: "ignore",
      });
    }
  }
  execSync(`sips -z 1024 1024 public/icons/icon-512.png --out ${iconsetDir}/icon_512x512@2x.png`, {
    cwd: rootDir,
    stdio: "ignore",
  });
  execSync(`iconutil -c icns ${iconsetDir} -o ${iconPath}`, { cwd: rootDir });
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  return iconPath;
}

async function build() {
  const nextDir = path.join(rootDir, ".next");
  if (!fs.existsSync(nextDir)) {
    console.log("Building Next.js production bundle (npm run build)...");
    execSync("npm run build", { cwd: rootDir, stdio: "inherit" });
  } else {
    console.log("Existing Next.js build found in .next directory.");
  }

  const iconPath = ensureIcon();

  console.log(`Packaging Pi Web macOS app (${process.arch})...`);
  const appPaths = await packager({
    dir: rootDir,
    name: "Pi Web",
    platform: "darwin",
    arch: process.arch,
    icon: iconPath,
    out: path.join(rootDir, "dist"),
    overwrite: true,
    appBundleId: "com.agegr.pi-web",
    appCategoryType: "public.app-category.developer-tools",
    extendInfo: {
      CFBundleDisplayName: "Pi Web",
      CFBundleName: "Pi Web",
      CFBundleIdentifier: "com.agegr.pi-web",
      CFBundleVersion: pkg.version,
      CFBundleShortVersionString: pkg.version,
      NSHumanReadableCopyright: `Copyright © ${new Date().getFullYear()}`,
      LSMinimumSystemVersion: "12.0",
      NSRequiresAquaSystemAppearance: false,
    },
    ignore: [
      /^\/\.git($|\/)/,
      /^\/\.github($|\/)/,
      /^\/e2e($|\/)/,
      /^\/docs($|\/)/,
      /^\/dist($|\/)/,
      /^\/demo($|\/)/,
      /^\/\.next\/cache($|\/)/,
      /^\/\.next\/dev($|\/)/,
      /\.test\.(js|ts|mjs|jsx|tsx)$/,
    ],
  });

  const appPath = path.join(appPaths[0], "Pi Web.app");
  console.log(`\nmacOS Application built successfully at:\n${appPath}\n`);
  console.log("To open the app:");
  console.log(`  open "${appPath}"`);
  console.log("\nTo install to Applications:");
  console.log(`  cp -R "${appPath}" /Applications/`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
