import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRooms } from './rooms.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(root, 'dist');
const production = process.argv.includes('--production');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
let vite;

function respond(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

async function serve(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) return respond(res, 405, 'Method not allowed');
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return respond(res, 400, 'Bad request'); }
  if (path === '/') path = '/index.html';
  const file = resolve(dist, `.${path}`);
  if (!file.startsWith(dist + sep)) return respond(res, 404, 'Not found');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return respond(res, 404, 'Not found');
  res.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

const server = createServer((req, res) => {
  if (req.url === '/healthz' && ['GET', 'HEAD'].includes(req.method)) return respond(res, 200, 'ok');
  if (vite) vite.middlewares(req, res, () => respond(res, 404, 'Not found'));
  else serve(req, res).catch(() => { if (!res.headersSent) respond(res, 500, 'Server error'); else res.destroy(); });
});

if (!production) {
  const { createServer: createVite } = await import('vite');
  vite = await createVite({ root, server: { middlewareMode: true, hmr: { server } } });
}
const dispose = attachRooms(server);
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`RIFT DUEL écoute sur le port ${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  dispose();
  await vite?.close();
  server.close();
});
