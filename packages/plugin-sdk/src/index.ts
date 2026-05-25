// @mimusic/plugin-sdk — 可选 helper 工具函数
// 在 QuickJS 中可直接运行（无 Node API 依赖）。

import type { HTTPResponse, HTTPRequest } from './global';

/**
 * 快速生成 JSON 响应
 */
export function jsonResponse(body: unknown, status = 200): HTTPResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * 解析 query string 为 Record<string, string>
 * 示例：parseQuery("a=1&b=hello") => {a: "1", b: "hello"}
 */
export function parseQuery(q: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!q) return result;
  const pairs = q.split('&');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) {
      result[decodeURIComponent(pair)] = '';
    } else {
      result[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
    }
  }
  return result;
}

// ===== 简易路由 =====
//
// 由于 mimusic.* 桥接 / fetch 都是真异步，handler 也允许返回
// `Promise<HTTPResponse>`，框架会自动 await。同步 handler 仍然兼容（直接返回 HTTPResponse）。

/** 路由 handler 返回值：同步 HTTPResponse 或异步 Promise<HTTPResponse> */
export type RouteResult = HTTPResponse | Promise<HTTPResponse>;

/** 路由 handler */
export type RouteHandler = (req: HTTPRequest, params: Record<string, string>) => RouteResult;

interface Route {
  method: string;
  pattern: string;
  segments: string[];
  handler: RouteHandler;
}

export interface Router {
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  put(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
  /**
   * 处理请求。返回同步或异步 HTTPResponse；handler 是 async function 时
   * 这里会传播 Promise，调用方必须 await 或返回它给框架（onHTTPRequest 默认是 async）。
   */
  handle(req: HTTPRequest): RouteResult;
}

/**
 * 创建简易路由器。支持 :param 路径参数。
 *
 * ```ts
 * const router = createRouter();
 * router.get('/hello/:name', async (req, params) => jsonResponse({ hi: params.name }));
 * async function onHTTPRequest(req) { return await router.handle(req); }
 * ```
 */
export function createRouter(): Router {
  const routes: Route[] = [];

  function addRoute(method: string, pattern: string, handler: RouteHandler) {
    routes.push({ method, pattern, segments: pattern.split('/').filter(Boolean), handler });
  }

  function matchRoute(method: string, path: string): { handler: RouteHandler; params: Record<string, string> } | null {
    const pathSegments = path.split('/').filter(Boolean);
    for (const route of routes) {
      if (route.method !== '*' && route.method !== method) continue;
      if (route.segments.length !== pathSegments.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = pathSegments[i];
        } else if (seg !== pathSegments[i]) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }

  return {
    get(path, handler) { addRoute('GET', path, handler); },
    post(path, handler) { addRoute('POST', path, handler); },
    put(path, handler) { addRoute('PUT', path, handler); },
    delete(path, handler) { addRoute('DELETE', path, handler); },
    handle(req) {
      const result = matchRoute(req.method, req.path);
      if (!result) {
        return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'not found' }) };
      }
      // 直接返回 handler 结果（可能是 HTTPResponse 或 Promise<HTTPResponse>）。
      return result.handler(req, result.params);
    },
  };
}

// ===== 音源插件 helper:统一的 search / music_url 接口约定 =====
//
// 主程序新架构(2026):
//   - 客户端播放 URL 永远是 /api/v1/songs/{id}/play
//   - songs 表存 (plugin_entry_path, source_data) 而非 hash + url
//   - 主程序 SourceFetcher 通过 POST /api/music/url + source_data 获取真实 URL
//   - search 返回的每条结果直接带 source_data,无需 urlmap 中转
//
// 本节 helper 把这套约定固化为标准 handler,音源插件按下面的方式接入:
//
//   const router = createRouter();
//   router.post('/api/search', createSearchHandler({
//     search: async (keyword, page, pageSize) => [
//       { title, artist, album, duration, cover_url, source_data: {...} },
//       ...
//     ],
//   }));
//   router.post('/api/music/url', createMusicUrlHandler({
//     resolveUrl: async (sourceData) => 'https://cdn.example.com/song.mp3',
//     fallbackSearch: async (hint) => ({ source_data: {...}, title, artist }),
//   }));

/** 单条搜索结果。source_data 是 opaque JSON,主程序原样存进 song 表,后续 music/url 时回传。 */
export interface SearchResultItem {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  cover_url?: string;
  source_data: Record<string, unknown>;
}

/** search handler 配置。 */
export interface SearchHandlerOptions {
  /**
   * 实际执行搜索的函数。
   * - keyword:用户搜索关键词
   * - page:页码(从 1 开始,可空)
   * - pageSize:每页条数(可空)
   * 返回 SearchResultItem[]。空数组表示无结果。
   */
  search: (keyword: string, page?: number, pageSize?: number) => Promise<SearchResultItem[]>;
}

/**
 * 创建符合主程序约定的 POST /api/search handler。
 *
 * Request body: { keyword: string, page?: number, page_size?: number }
 * Response: { results: SearchResultItem[] }
 *
 * 错误响应统一 400/500 JSON,无须插件自己处理。
 */
export function createSearchHandler(opts: SearchHandlerOptions): RouteHandler {
  return async (req) => {
    let body: Record<string, unknown> = {};
    if (req.body) {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : {};
      } catch {
        return jsonResponse({ error: 'invalid json body' }, 400);
      }
    }
    const keyword = String(body.keyword || '').trim();
    if (!keyword) {
      return jsonResponse({ error: 'keyword is required' }, 400);
    }
    const page = typeof body.page === 'number' ? body.page : undefined;
    const pageSize = typeof body.page_size === 'number' ? body.page_size : undefined;
    try {
      const results = await opts.search(keyword, page, pageSize);
      return jsonResponse({ results: results || [] });
    } catch (err) {
      return jsonResponse({ error: String((err as Error)?.message || err) }, 500);
    }
  };
}

/** music_url handler 的 fallback hint(主程序在主源失败时下发) */
export interface MusicUrlFallbackHint {
  enabled: boolean;
  title: string;
  artist: string;
  duration?: number;
}

/** fallbackSearch 的返回:找到匹配则返回新 source_data;找不到返回 null */
export interface FallbackMatch {
  source_data: Record<string, unknown>;
  title?: string;
  artist?: string;
}

/** music_url handler 配置 */
export interface MusicUrlHandlerOptions {
  /**
   * 用 source_data 解析真实播放 URL。失败抛错。
   */
  resolveUrl: (sourceData: Record<string, unknown>) => Promise<string>;
  /**
   * 可选的"插件内自搜"。当 resolveUrl 失败且 hint.enabled=true 时被调用,
   * 返回最匹配的新 source_data。返回 null 表示放弃。
   *
   * 实现建议:用 hint.title + hint.artist 在该插件支持的平台搜一次,
   * 按相似度选最佳匹配。
   */
  fallbackSearch?: (hint: MusicUrlFallbackHint) => Promise<FallbackMatch | null>;
}

/**
 * 创建符合主程序约定的 POST /api/music/url handler。
 *
 * Request body:
 *   {
 *     source_data: object,       // 必填
 *     fallback?: {                // 可选,主程序在主源失败时下发
 *       enabled: boolean,
 *       title: string,
 *       artist: string,
 *       duration?: number,
 *     }
 *   }
 *
 * Response 200:
 *   {
 *     url: string,                          // 真实 CDN URL
 *     source_data?: object,                 // 若 fallback 触发,返回新的 source_data
 *     used_fallback?: boolean
 *   }
 *
 * Response 404:
 *   { error: 'source_not_available' }
 *
 * 链路:
 *   1. 用入参 source_data 调 resolveUrl;成功 → 返回 url
 *   2. 失败且 fallback.enabled=true 且配置了 fallbackSearch:
 *      → 调 fallbackSearch(hint) 拿新 source_data
 *      → 再调 resolveUrl(new source_data)
 *      → 成功返回 { url, source_data: new, used_fallback: true }
 *   3. 全失败 → 404 source_not_available
 */
export function createMusicUrlHandler(opts: MusicUrlHandlerOptions): RouteHandler {
  return async (req) => {
    let body: Record<string, unknown> = {};
    if (req.body) {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : {};
      } catch {
        return jsonResponse({ error: 'invalid json body' }, 400);
      }
    }
    const sourceData = body.source_data as Record<string, unknown> | undefined;
    if (!sourceData || typeof sourceData !== 'object') {
      return jsonResponse({ error: 'source_data is required' }, 400);
    }

    // 1. 主路径:直接 resolveUrl(source_data)
    try {
      const url = await opts.resolveUrl(sourceData);
      if (url) {
        return jsonResponse({ url });
      }
    } catch {
      // 落入 fallback
    }

    // 2. fallback 路径
    const hint = body.fallback as MusicUrlFallbackHint | undefined;
    if (hint && hint.enabled && opts.fallbackSearch) {
      try {
        const match = await opts.fallbackSearch(hint);
        if (match && match.source_data) {
          const url = await opts.resolveUrl(match.source_data);
          if (url) {
            return jsonResponse({
              url,
              source_data: match.source_data,
              used_fallback: true,
            });
          }
        }
      } catch {
        // 继续走到 404
      }
    }

    return jsonResponse({ error: 'source_not_available' }, 404);
  };
}

// Re-export types for convenience
export type {
  Song,
  Playlist,
  HTTPRequest,
  HTTPResponse,
  PluginManifest,
  Mimusic,
  MimusicJSEnv,
  MimusicJSEnvCall,
  MimusicJSEnvEvent,
  MimusicJSEnvResult,
  MimusicJSEnvParallelResult,
} from './global';
