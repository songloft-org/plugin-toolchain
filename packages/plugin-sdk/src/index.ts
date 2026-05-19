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

type RouteHandler = (req: HTTPRequest, params: Record<string, string>) => HTTPResponse;

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
  handle(req: HTTPRequest): HTTPResponse;
}

/**
 * 创建简易路由器。支持 :param 路径参数。
 *
 * ```ts
 * const router = createRouter();
 * router.get('/hello/:name', (req, params) => jsonResponse({ hi: params.name }));
 * function onHTTPRequest(req) { return router.handle(req); }
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
      return result.handler(req, result.params);
    },
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
