/**
 * Greenlight — HTTP server.
 *   GET  /            static UI (public/)
 *   GET  /api/health     liveness + which integrations are configured
 *   POST /api/greenlight  { logline, title?, format?, genre?, budgetTier? } → Server-Sent Events stream of crew activity, ending with the memo
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCrew, MODEL, SPECIALISTS } from './agents.js';

const PORT = Number(process.env.PORT || 8080);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: '1h' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, gemini: Boolean(process.env.GEMINI_API_KEY), parallel: Boolean(process.env.PARALLEL_API_KEY) });
});

app.get('/api/crew', (_req, res) => {
  res.json({ model: MODEL, agents: SPECIALISTS.map(({ id, name, role }) => ({ id, name, role })) });
});

// Tiny in-memory rate limit so the public demo cannot be drained: N runs per IP per window.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_RUNS_PER_WINDOW = Number(process.env.MAX_RUNS_PER_WINDOW || 8);
const runs = new Map();
function allow(ip) {
  const now = Date.now();
  const list = (runs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_RUNS_PER_WINDOW) return false;
  list.push(now);
  runs.set(ip, list);
  return true;
}

app.post('/api/greenlight', async (req, res) => {
  const body = req.body || {};
  const logline = String(body.logline || '').trim();
  if (logline.length < 20 || logline.length > 1500) {
    return res.status(400).json({ error: 'Please give the crew a logline between 20 and 1500 characters.' });
  }
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (!allow(ip)) return res.status(429).json({ error: 'The crew is busy. Try again in a few minutes.' });

  const brief = {
    logline,
    title: String(body.title || '').trim().slice(0, 120),
    format: String(body.format || '').trim().slice(0, 40),
    genre: String(body.genre || '').trim().slice(0, 60),
    budgetTier: String(body.budgetTier || '').trim().slice(0, 40),
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.socket?.setNoDelay?.(true);
  res.socket?.setKeepAlive?.(true);
  // Note: `req.on('close')` is the wrong signal here — in Node 16+ it fires as soon as the request body has been
  // consumed, i.e. immediately after express.json(), which would silently drop every later event. The *response*
  // close event fires when the client disconnects (or after res.end()).
  let open = true;
  res.on('close', () => (open = false));
  const send = (event) => {
    if (!open || res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const heartbeat = setInterval(() => open && !res.writableEnded && res.write(': ping\n\n'), 15_000);

  try {
    await runCrew(brief, send);
    send({ type: 'done' });
  } catch (err) {
    console.error('[greenlight] run failed:', err);
    send({ type: 'error', message: err?.message || 'The crew hit an unexpected error.' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Greenlight listening on :${PORT} · model=${MODEL} · parallel=${process.env.PARALLEL_API_KEY ? 'configured' : 'MISSING'}`);
});
