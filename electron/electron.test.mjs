import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("macOS application bundle icon exists and is non-empty", () => {
  const iconPath = path.join(rootDir, "electron", "assets", "icon.icns");
  assert.ok(fs.existsSync(iconPath), "icon.icns must exist");
  const stats = fs.statSync(iconPath);
  assert.ok(stats.size > 10_000, `icon.icns size (${stats.size}) should be substantial`);
});

test("package.json has correct Electron main entry point and mac scripts", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  assert.equal(pkg.main, "electron/main.cjs", "package.json main must point to electron/main.cjs");
  assert.ok(pkg.scripts["mac"], "package.json must have mac script");
  assert.ok(pkg.scripts["mac:dev"], "package.json must have mac:dev script");
  assert.ok(pkg.scripts["mac:build"], "package.json must have mac:build script");
});

test("ServerManager defaults to loopback 127.0.0.1 and port 30141", async () => {
  const { ServerManager } = await import("./server-manager.cjs");
  const manager = new ServerManager();
  assert.equal(manager.hostname, "127.0.0.1");
  assert.equal(manager.port, 30141);
  assert.equal(manager.getUrl(), "http://127.0.0.1:30141");
});

test("isServerAnswering detects an answering HTTP server", async () => {
  const { isServerAnswering } = await import("./server-manager.cjs");
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;

  try {
    const answering = await isServerAnswering("127.0.0.1", port);
    assert.equal(answering, true, "isServerAnswering should be true for listening server");

    const nonExistentPort = 65530;
    const notAnswering = await isServerAnswering("127.0.0.1", nonExistentPort);
    assert.equal(notAnswering, false, "isServerAnswering should be false for closed port");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
