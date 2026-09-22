import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

async function resolveFile(pathname) {
  const target = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!target.startsWith(ROOT)) {
    return null;
  }
  const info = await stat(target).catch(() => null);
  if (info?.isDirectory()) {
    return resolveFile(join(pathname, "index.html"));
  }
  return info ? { path: target, size: info.size } : null;
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");
  const file = await resolveFile(pathname);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const headers = {
    "Content-Type": TYPES[extname(file.path)] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  };
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
    response.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${file.size}`, "Content-Length": end - start + 1 });
    createReadStream(file.path, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "Content-Length": file.size });
  createReadStream(file.path).pipe(response);
}).listen(PORT, () => console.log(`Etinuxia running at http://localhost:${PORT}`));
