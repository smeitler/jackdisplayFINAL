import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Serve static public files (privacy policy, terms, etc.)
  // In dev: __dirname = server/_core/, so ../../public = project root/public
  // In prod (Railway): __dirname = dist/, so ../public = project root/public
  const publicDir = process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "../public")
    : path.resolve(__dirname, "../../public");
  app.use(express.static(publicDir));

  // Canonical privacy policy URL
  app.get("/privacy", (_req, res) => {
    res.sendFile(path.join(publicDir, "privacy-policy.html"));
  });

  registerOAuthRoutes(app);

  // Physical alarm clock device API
  const { default: deviceRouter } = await import("../deviceRoutes.js");
  app.use("/api/device", deviceRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Image upload endpoint for team posts
  app.post("/api/upload-team-image", async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      await new Promise<void>((resolve, reject) => {
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] ?? "";
      const boundary = contentType.split("boundary=")[1];
      if (!boundary) { res.status(400).json({ error: "No boundary" }); return; }
      // Parse multipart manually
      const boundaryBuf = Buffer.from("--" + boundary);
      const parts: { name: string; filename: string; contentType: string; data: Buffer }[] = [];
      let pos = 0;
      while (pos < body.length) {
        const start = body.indexOf(boundaryBuf, pos);
        if (start === -1) break;
        pos = start + boundaryBuf.length;
        if (body[pos] === 45 && body[pos + 1] === 45) break; // --
        if (body[pos] === 13) pos += 2; // \r\n
        const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), pos);
        if (headerEnd === -1) break;
        const headers = body.slice(pos, headerEnd).toString();
        pos = headerEnd + 4;
        const nextBoundary = body.indexOf(boundaryBuf, pos);
        const dataEnd = nextBoundary === -1 ? body.length : nextBoundary - 2;
        const data = body.slice(pos, dataEnd);
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const ctMatch = headers.match(/Content-Type: ([^\r\n]+)/);
        parts.push({ name: nameMatch?.[1] ?? "", filename: filenameMatch?.[1] ?? "file", contentType: ctMatch?.[1] ?? "application/octet-stream", data });
        pos = nextBoundary === -1 ? body.length : nextBoundary;
      }
      const filePart = parts.find((p) => p.name === "file");
      if (!filePart) { res.status(400).json({ error: "No file part" }); return; }
      const { storagePut } = await import("../storage.js");
      const key = `team-posts/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { url } = await storagePut(key, filePart.data, filePart.contentType);
      res.json({ url });
    } catch (err: any) {
      console.error("[upload-team-image]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
