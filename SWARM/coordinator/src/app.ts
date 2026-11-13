import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseEnvelope, type ServerMessage } from '@swarm/shared';
import type { Config } from './config';
import { Coordinator } from './coordinator';
import { simCodec } from './devices/sim-codec';
import { SimFleet } from './sim/fleet';
import type { SimNodeOptions } from './sim/node';

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(here, '../../web/dist');
const DATA_DIR = resolve(here, '../data');
const PRESETS_FILE = join(DATA_DIR, 'presets.json');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon'
};

export interface App {
  coordinator: Coordinator;
  sim: SimFleet | null;
  server: Server;
  port: number;
  close(): Promise<void>;
}

export async function createApp(cfg: Config, simOptions: SimNodeOptions = {}): Promise<App> {
  if (cfg.fleet === 'hardware') {
    // Refuse rather than pretend: there is no codec for the real firmware protocol yet.
    throw new Error(
      'SWARM_FLEET=hardware is not available in this build. The coordinator has no codec for SWARM firmware v0.2.0 ' +
        'because SWARM/firmware/docs/PROTOCOL.md was not available when it was written. See README.md, "Connecting real hardware".'
    );
  }
  const coordinator = new Coordinator(cfg, simCodec);
  const server = createServer((req, res) => void http(req, res, cfg, coordinator));
  const deviceWss = new WebSocketServer({ noServer: true });
  const clientWss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

  deviceWss.on('connection', (ws) => coordinator.device.accept(ws));

  const sockets = new Map<string, WebSocket>();
  clientWss.on('connection', (ws) => {
    const clientId = randomUUID();
    sockets.set(clientId, ws);
    coordinator.clientJoined(clientId);
    const send = (m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
    send({ type: 'snapshot', snapshot: coordinator.snapshot(clientId) });
    ws.on('message', async (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        return;
      }
      const env = parseEnvelope(raw);
      if ('error' in env) {
        const id = raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : '';
        send({ type: 'result', id, ok: false, error: env.error });
        return;
      }
      try {
        const r = await coordinator.handle(clientId, env.intent);
        send({ type: 'result', id: env.id, ...r });
      } catch (e) {
        coordinator.note('error', `Intent ${env.intent.type} crashed: ${e instanceof Error ? e.message : String(e)}`);
        send({ type: 'result', id: env.id, ok: false, error: 'Internal coordinator error. See the log.' });
      }
    });
    ws.on('close', () => {
      sockets.delete(clientId);
      coordinator.clientLeft(clientId);
    });
    ws.on('error', () => ws.close());
  });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === cfg.devicePath) deviceWss.handleUpgrade(req, socket, head, (ws) => deviceWss.emit('connection', ws, req));
    else if (path === cfg.clientPath) clientWss.handleUpgrade(req, socket, head, (ws) => clientWss.emit('connection', ws, req));
    else socket.destroy();
  });

  const broadcast = setInterval(() => {
    for (const [id, ws] of sockets) {
      if (ws.readyState === ws.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify({ type: 'snapshot', snapshot: coordinator.snapshot(id) } satisfies ServerMessage));
    }
  }, cfg.snapshotIntervalMs);

  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(cfg.port, cfg.host, ok);
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : cfg.port;

  const sim = new SimFleet(`ws://127.0.0.1:${port}${cfg.devicePath}`, simOptions);
  coordinator.sim = sim;
  sim.start();
  coordinator.note('info', `Coordinator listening on port ${port} with nine SIMULATED nodes (${simCodec.name}). No hardware is connected.`);

  return {
    coordinator, sim, server, port,
    close: async () => {
      clearInterval(broadcast);
      sim.stop();
      coordinator.close();
      for (const ws of sockets.values()) ws.terminate();
      deviceWss.close();
      clientWss.close();
      await new Promise<void>((r) => server.close(() => r()));
    }
  };
}

async function http(req: IncomingMessage, res: ServerResponse, cfg: Config, coordinator: Coordinator): Promise<void> {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (path === '/api/health') return json(200, { ok: true, fleet: cfg.fleet, env: cfg.env });
  if (path === '/api/presets') {
    if (req.method === 'GET') return json(200, existsSync(PRESETS_FILE) ? JSON.parse(readFileSync(PRESETS_FILE, 'utf8')) : {});
    if (req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return json(413, { error: 'too large' });
      }
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(PRESETS_FILE, JSON.stringify(parsed, null, 2));
        coordinator.note('info', 'Preset parameters saved.');
        return json(200, { ok: true });
      } catch {
        return json(400, { error: 'invalid JSON' });
      }
    }
    return json(405, { error: 'method not allowed' });
  }
  if (path.startsWith('/api/')) return json(404, { error: 'not found' });

  // Static frontend (production-style). In development Vite serves the frontend instead.
  if (!existsSync(WEB_DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The frontend has not been built. Run "npm run build", or use "npm run dev" and open the Vite address.');
    return;
  }
  let file = normalize(join(WEB_DIST, path));
  if (!file.startsWith(WEB_DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB_DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600' });
  createReadStream(file).pipe(res);
}
