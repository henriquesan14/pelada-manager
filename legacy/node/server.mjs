import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.mjs';
import { AppError, requireValue } from './lib/errors.mjs';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png' };
const isMutation = method => ['POST', 'DELETE', 'PUT', 'PATCH'].includes(method);

async function readJson(req) {
  requireValue(req.headers['content-type']?.split(';')[0] === 'application/json', 'Envie JSON.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    requireValue(size <= 65536, 'Requisição muito grande.', 413);
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    requireValue(data && typeof data === 'object' && !Array.isArray(data), 'JSON inválido.');
    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'JSON inválido.');
  }
}

export function createApp({ database = resolve('data/resenha.sqlite'), setupToken = process.env.SETUP_TOKEN,
  origin = process.env.APP_ORIGIN, secure = process.env.NODE_ENV === 'production' } = {}) {
  if (origin) origin = new URL(origin).origin;
  if (secure && !origin?.startsWith('https://')) throw new Error('Configure APP_ORIGIN com o endereço HTTPS em produção.');
  const store = createStore(database);
  const attempts = new Map();
  function limit(req) {
    const now = Date.now(), ip = req.socket.remoteAddress;
    for (const [key, item] of attempts) if (item.until < now) attempts.delete(key);
    const item = attempts.get(ip) || { count: 0, until: now + 600000 };
    item.count++;
    attempts.set(ip, item);
    requireValue(item.count <= 30, 'Muitas tentativas. Aguarde 10 minutos.', 429);
  }
  function cookie(res, value = '') {
    res.setHeader('Set-Cookie', `resenha_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? 604800 : 0}${secure ? '; Secure' : ''}`);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        if (isMutation(req.method)) {
          const expected = origin || `http://${req.headers.host}`;
          requireValue(req.headers.origin === expected && req.headers['x-resenha-client'] === '1', 'Origem não autorizada.', 403);
        }
        const sessionToken = /(?:^|;\s*)resenha_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
        const user = store.authenticate(sessionToken);
        if (req.method === 'GET' && path === '/api/session') {
          return send(200, { user, needsSetup: !store.hasUsers(), setupEnabled: typeof setupToken === 'string' && setupToken.length >= 24 });
        }
        if (req.method === 'POST' && ['/api/register', '/api/login'].includes(path)) {
          limit(req);
          const input = await readJson(req);
          const result = path === '/api/register' ? await store.register(input, setupToken) : await store.login(input);
          cookie(res, result.token);
          return send(200, { user: result.user });
        }
        requireValue(user, 'Entre na sua conta para continuar.', 401);
        if (req.method === 'POST' && path === '/api/logout') {
          store.logout(sessionToken);
          cookie(res);
          return send(200, { ok: true });
        }
        if (req.method === 'GET' && path === '/api/state') return send(200, store.snapshot());
        if (req.method === 'POST' && path === '/api/actions') {
          return send(200, store.action(user, await readJson(req)));
        }
        if (req.method === 'GET' && path === '/api/organizers') return send(200, { organizers: store.organizers(), activity: store.activity() });
        if (req.method === 'POST' && path === '/api/invites') return send(201, store.invite(user));
        if (req.method === 'POST' && path === '/api/revoke') {
          const input = await readJson(req);
          requireValue(typeof input.id === 'string', 'Organizador inválido.');
          store.revoke(user, input.id);
          return send(200, { ok: true });
        }
        throw new AppError(404, 'Rota não encontrada.');
      }
      requireValue(req.method === 'GET' || req.method === 'HEAD', 'Método não permitido.', 405);
      const pathname = decodeURIComponent(path);
      const base = resolve(root);
      const file = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      requireValue(file.startsWith(base + sep), 'Acesso negado.', 403);
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
      send(status, { error: error instanceof AppError ? error.message : status === 404 ? 'Não encontrado.' : 'Não foi possível concluir a operação.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, store, close: () => new Promise((resolve, reject) => {
    server.close(error => { store.close(); error ? reject(error) : resolve(); });
    server.closeIdleConnections();
  }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  const app = createApp();
  app.server.listen(port, '0.0.0.0', () => console.log(`Resenha: http://localhost:${port}`));
  const shutdown = () => app.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
