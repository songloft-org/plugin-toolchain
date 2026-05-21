/// <reference types="@mimusic/plugin-sdk" />
import { jsonResponse, createRouter } from '@mimusic/plugin-sdk';

// Router 支持 async handler；所有 mimusic.* 桥接调用必须 await。

const router = createRouter();

router.get('/hello', (req) => {
  return jsonResponse({
    message: 'Hello from example-basic!',
    query: req.query,
  });
});

router.get('/songs', async (req) => {
  const limitStr = (req.query as unknown as Record<string, string>)['limit'] ?? '10';
  const limit = Math.max(1, Math.min(100, Number.parseInt(limitStr, 10) || 10));
  const songs = await mimusic.songs.list({ limit });
  return jsonResponse({ count: songs.length, songs });
});

router.get('/songs/:id', async (_req, params) => {
  const id = Number.parseInt(params['id'] ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return jsonResponse({ error: 'invalid id' }, 400);
  }
  const song = await mimusic.songs.getById(id);
  if (!song) return jsonResponse({ error: 'not found' }, 404);
  return jsonResponse(song);
});

router.get('/', () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: '<h1>example-basic</h1><p>Try <a href="hello">/hello</a> or <a href="songs">/songs</a>.</p>',
  };
});

async function onInit(): Promise<void> {
  mimusic.log.info('example-basic initialized');
}

async function onDeinit(): Promise<void> {
  mimusic.log.info('example-basic deinitialized');
}

async function onHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  return await router.handle(req);
}

globalThis.onInit = onInit;
globalThis.onDeinit = onDeinit;
globalThis.onHTTPRequest = onHTTPRequest;
