/// <reference types="@songloft/plugin-sdk" />
import { jsonResponse, createRouter } from '@songloft/plugin-sdk';

// Router 支持 async handler。所有 songloft.* / fetch 调用必须 await。

const router = createRouter();

router.get('/hello', (req) => {
  return jsonResponse({ message: 'Hello from {{name}}!', query: req.query });
});

router.get('/songs', async () => {
  const songs = await songloft.songs.list({ limit: 10 });
  return jsonResponse({ count: songs.length, songs });
});

async function onInit(): Promise<void> {
  songloft.log.info('{{name}} initialized');
}

async function onDeinit(): Promise<void> {
  songloft.log.info('{{name}} deinitialized');
}

async function onHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  return await router.handle(req);
}

// 暴露为全局（QuickJS 需要显式声明）
globalThis.onInit = onInit;
globalThis.onDeinit = onDeinit;
globalThis.onHTTPRequest = onHTTPRequest;
