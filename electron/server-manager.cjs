/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_PORT = 30141;
const DEFAULT_HOST = "127.0.0.1";
const SERVER_READY_TIMEOUT_MS = 60_000;
const SERVER_POLL_INTERVAL_MS = 300;

function isServerAnswering(hostname, port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname,
        port,
        path: "/",
        method: "GET",
        timeout: 1000,
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForServer(hostname, port, timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerAnswering(hostname, port)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS));
  }
  return false;
}

class ServerManager {
  constructor(options = {}) {
    this.port = options.port || Number(process.env.PI_WEB_PORT || process.env.PORT) || DEFAULT_PORT;
    this.hostname = DEFAULT_HOST;
    this.isPackaged = Boolean(options.isPackaged);
    this.appRoot = options.appRoot || path.resolve(__dirname, "..");
    this.child = null;
  }

  getUrl() {
    return `http://${this.hostname}:${this.port}`;
  }

  async start() {
    const alreadyRunning = await isServerAnswering(this.hostname, this.port);
    if (alreadyRunning) {
      console.log(`[Electron] Pi Web server is already answering at ${this.getUrl()}`);
      return { url: this.getUrl(), child: null };
    }

    console.log(`[Electron] Starting Pi Web background server on port ${this.port}...`);

    let binPath;
    let args;
    let execPath;
    let env = {
      ...process.env,
      PI_WEB_HOSTNAME: this.hostname,
      PORT: String(this.port),
      NODE_ENV: this.isPackaged ? "production" : "development",
    };

    if (this.isPackaged) {
      // In a packaged Electron app, process.execPath is the Electron executable.
      // Running with ELECTRON_RUN_AS_NODE=1 turns Electron into a standard Node.js runtime.
      execPath = process.execPath;
      binPath = path.join(this.appRoot, "bin", "pi-web.js");
      args = [binPath, "start", "-p", String(this.port), "-H", this.hostname];
      env.ELECTRON_RUN_AS_NODE = "1";
    } else {
      // In development mode, run next dev or npm run dev directly
      execPath = process.execPath;
      const nextBin = path.join(this.appRoot, "node_modules", "next", "dist", "bin", "next");
      binPath = nextBin;
      args = ["dev", "-H", this.hostname, "-p", String(this.port)];
    }

    this.child = spawn(execPath, [binPath, ...args.slice(1)], {
      cwd: this.appRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child.stdout?.on("data", (data) => {
      const line = data.toString();
      process.stdout.write(`[Server] ${line}`);
    });

    this.child.stderr?.on("data", (data) => {
      const line = data.toString();
      process.stderr.write(`[Server Error] ${line}`);
    });

    this.child.on("exit", (code, signal) => {
      console.log(`[Electron] Server process exited with code ${code}, signal ${signal}`);
      this.child = null;
    });

    const ready = await waitForServer(this.hostname, this.port);
    if (!ready) {
      this.stop();
      throw new Error(`Pi Web server failed to answer at ${this.getUrl()} within ${SERVER_READY_TIMEOUT_MS / 1000}s`);
    }

    console.log(`[Electron] Pi Web server ready at ${this.getUrl()}`);
    return { url: this.getUrl(), child: this.child };
  }

  stop() {
    if (!this.child) return;
    console.log("[Electron] Stopping server process...");
    try {
      this.child.kill("SIGTERM");
      const pid = this.child.pid;
      setTimeout(() => {
        try {
          if (pid) process.kill(pid, "SIGKILL");
        } catch {
          // Process already terminated
        }
      }, 3000).unref();
    } catch (err) {
      console.error("[Electron] Error killing server:", err);
    }
    this.child = null;
  }
}

module.exports = {
  ServerManager,
  isServerAnswering,
  waitForServer,
};
