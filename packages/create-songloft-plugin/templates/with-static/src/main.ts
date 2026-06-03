/// <reference types="@songloft/plugin-sdk" />
import { jsonResponse, createRouter } from '@songloft/plugin-sdk';

// Router 支持 async handler。所有 songloft.* / fetch 调用必须 await。

const router = createRouter();

// === 前端 API 示例 ===
// static/js/common.js 封装了 apiGet / apiPost 等请求函数，
// 前端通过这些接口与后端交互。

router.get('/api/hello', () => {
  return jsonResponse({ message: 'Hello from {{name}}!' });
});

router.get('/api/config', async () => {
  const config = await songloft.storage.get('config');
  return jsonResponse(config || {});
});

router.post('/api/config', async (req) => {
  const body = req.body ? JSON.parse(String(req.body)) : {};
  await songloft.storage.set('config', body);
  return jsonResponse({ success: true });
});

router.get('/api/songs', async () => {
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
