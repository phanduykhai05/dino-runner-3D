import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomHub } from './rooms.js';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

export async function createGameServer({ dev = false, automaticTick = true, now, graceMs } = {}) {
  const hub = new RoomHub({ now, graceMs });
  let vite;
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: hub.rooms.size }));
      return;
    }
    if (vite) { vite.middlewares(req, res, () => { res.writeHead(404); res.end(); }); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const path = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const info = await stat(path);
      if (!info.isFile()) throw new Error();
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': info.size,
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': extname(path) === '.html' ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(path).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Không tìm thấy tài nguyên. Chạy npm run build trước khi khởi động máy chủ.'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/ws') { if (!dev) socket.destroy(); return; }
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host && !allowed.includes(req.headers.origin)) { socket.destroy(); return; }
      } catch { socket.destroy(); return; }
    }
    if (wss.clients.size >= 1000) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', socket => {
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    hub.attach(socket);
  });
  const tick = automaticTick ? setInterval(() => hub.tick(), 1000 / 60) : null;
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 15000);
  heartbeat.unref();
  if (dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  }
  return { server, hub, wss, async close() {
    clearInterval(tick); clearInterval(heartbeat);
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (vite) await vite.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dev = process.argv.includes('--dev');
  const port = Number(process.env.PORT || (dev ? 5173 : 3001));
  const app = await createGameServer({ dev });
  app.server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Dino Runner: http://localhost:${port} (${dev ? 'development' : 'production'}, 5-player realtime rooms)`));
  app.server.on('error', error => { console.error(error.message); app.close().finally(() => process.exit(1)); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().finally(() => process.exit(0)));
}
