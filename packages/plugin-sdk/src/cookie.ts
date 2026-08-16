// Cookie 工具：Set-Cookie 解析、Cookie 请求头构建、跨域名 CookieJar。
//
// 由来：宿主的 fetch 早期只回传折叠成 ", " 单串的响应头，插件想拿多条 Set-Cookie
// 只能自己启发式切分。songloft-plugin-miot 和 songloft-plugin-bili 各自写了一套，
// 这里把它们合并为 SDK 公共实现（源码主要来自 miot 的 src/utils/cookie.ts）。
//
// 宿主自 v2.13.8 起提供无损的 headers.getSetCookie()，getSetCookie() 会优先用它，
// 老宿主上自动退回启发式切分（见该函数注释）。因此本模块对新旧宿主都可用，
// 插件无需按宿主版本分支。
//
// 术语区分（**混用会静默出 bug**）：
//   parseSetCookie(headers[], url) —— 解析**响应**头 Set-Cookie，带 Domain/Path/Expires 等属性
//   parseCookieHeader(str)         —— 解析**请求**头 Cookie（"k=v; k2=v2"），只有名值对

/** 单条 Cookie */
export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** 过期时间（Unix 毫秒）。undefined 表示会话 Cookie */
  expires?: number;
  secure: boolean;
  httpOnly: boolean;
}

/**
 * 从 fetch 的 Response 里取出所有 Set-Cookie，逐条完整。
 *
 * 优先走宿主提供的 `headers.getSetCookie()`（无损）。老宿主没有该方法时，
 * 退回对折叠串做启发式切分——**这条路径可能切错**：cookie 的
 * `Expires=Wed, 21 Oct 2026 07:28:00 GMT` 属性本身含 ", "，与条目分隔符无法可靠区分，
 * 只能靠「逗号后是否像 name=」加日期片段识别来猜。用户升级宿主后自动走无损路径。
 *
 * 实测反例（这就是为什么无损路径必须保留）：单条 `token=abc,def=ghi; Path=/`
 * 会被启发式误切成 `["token=abc", "def=ghi; Path=/"]`，而新宿主原样返回一条。
 */
export function getSetCookie(resp: unknown): string[] {
  const headers = (resp as { headers?: unknown } | null | undefined)?.headers;
  if (!headers || typeof headers !== 'object') return [];

  // 新宿主：无损数组。
  const direct = (headers as { getSetCookie?: unknown }).getSetCookie;
  if (typeof direct === 'function') {
    const list = (direct as () => unknown).call(headers);
    if (Array.isArray(list)) return list.map((v) => String(v));
  }

  // 老宿主：折叠串 + 启发式切分。
  const bag = headers as Record<string, unknown>;
  let raw: unknown;
  if (Object.prototype.hasOwnProperty.call(bag, 'Set-Cookie')) {
    raw = bag['Set-Cookie'];
  } else {
    for (const k of Object.keys(bag)) {
      if (k.toLowerCase() === 'set-cookie') {
        raw = bag[k];
        break;
      }
    }
  }
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => splitSetCookieHeader(String(v)));
  return splitSetCookieHeader(String(raw));
}

/**
 * 切分被折叠为逗号分隔的 Set-Cookie 串。
 *
 * 启发式：只有当逗号后紧跟 `name=`（且 `=` 出现在 `;` 之前）才认为是新条目，
 * 同时排除 Expires 日期里的逗号（`isDateFragment`）。仅用于兼容老宿主，
 * 新宿主请走 getSetCookie() 的无损路径。
 */
function splitSetCookieHeader(header: string): string[] {
  const result: string[] = [];
  let current = '';
  let i = 0;

  while (i < header.length) {
    const commaIdx = header.indexOf(',', i);
    if (commaIdx === -1) {
      current += header.slice(i);
      break;
    }

    const afterComma = header.slice(commaIdx + 1).trimStart();
    const eqIdx = afterComma.indexOf('=');
    const semiIdx = afterComma.indexOf(';');
    const spaceIdx = afterComma.indexOf(' ');

    if (eqIdx > 0 && (semiIdx === -1 || eqIdx < semiIdx) && (spaceIdx === -1 || eqIdx < spaceIdx || spaceIdx > 0)) {
      const beforeComma = header.slice(i, commaIdx);
      if (isDateFragment(beforeComma)) {
        current += header.slice(i, commaIdx + 1);
        i = commaIdx + 1;
      } else {
        current += header.slice(i, commaIdx);
        result.push(current.trim());
        current = '';
        i = commaIdx + 1;
      }
    } else {
      current += header.slice(i, commaIdx + 1);
      i = commaIdx + 1;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

/** 是否像日期片段——用于区分 Expires 里的逗号与条目分隔逗号 */
function isDateFragment(str: string): boolean {
  const trimmed = str.trim();
  const lastPart = trimmed.split(';').pop()?.trim() || '';
  return /expires\s*=\s*\w{3}$/i.test(lastPart) || /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(lastPart);
}

/**
 * 解析 Set-Cookie **响应**头数组为 Cookie 对象。
 * @param setCookieHeaders Set-Cookie 各条原始值（用 getSetCookie(resp) 取得）
 * @param requestUrl 发起请求的 URL，用于在 Cookie 未显式给出 Domain/Path 时推断默认值
 */
export function parseSetCookie(setCookieHeaders: string[], requestUrl: string): Cookie[] {
  const cookies: Cookie[] = [];
  const urlDomain = extractDomain(requestUrl);
  const urlPath = extractPath(requestUrl);

  for (const header of setCookieHeaders) {
    const cookie = parseSingleCookie(header, urlDomain, urlPath);
    if (cookie) cookies.push(cookie);
  }
  return cookies;
}

/**
 * 解析 Cookie **请求**头字符串（`"k=v; k2=v2"`）为名值映射。
 *
 * 与 parseSetCookie 语义完全不同：这里没有 Domain/Path/Expires 属性，
 * 每个 `;` 段都是一个 Cookie。典型来源是用户从浏览器手工粘贴的 Cookie。
 */
export function parseCookieHeader(s: string): Record<string, string> {
  const m: Record<string, string> = {};
  if (!s) return m;
  for (const part of s.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) m[k] = v;
  }
  return m;
}

/** 把名值映射序列化为 Cookie 请求头（`"k=v; k2=v2"`） */
export function stringifyCookieHeader(m: Record<string, string>): string {
  return Object.keys(m)
    .map((k) => `${k}=${m[k]}`)
    .join('; ');
}

function parseSingleCookie(header: string, defaultDomain: string, defaultPath: string): Cookie | null {
  const parts = header.split(';').map((p) => p.trim());
  if (parts.length === 0) return null;

  const firstPart = parts[0];
  const eqIdx = firstPart.indexOf('=');
  if (eqIdx === -1) return null;

  const name = firstPart.slice(0, eqIdx).trim();
  const value = firstPart.slice(eqIdx + 1).trim();
  if (!name) return null;

  const cookie: Cookie = {
    name,
    value,
    domain: defaultDomain,
    path: defaultPath,
    secure: false,
    httpOnly: false,
  };

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const attrEq = part.indexOf('=');
    let attrName: string;
    let attrValue: string;

    if (attrEq === -1) {
      attrName = part.toLowerCase();
      attrValue = '';
    } else {
      attrName = part.slice(0, attrEq).trim().toLowerCase();
      attrValue = part.slice(attrEq + 1).trim();
    }

    switch (attrName) {
      case 'domain':
        // 去掉前导点：`.example.com` 与 `example.com` 的匹配范围等价
        cookie.domain = attrValue.startsWith('.') ? attrValue.slice(1) : attrValue;
        break;
      case 'path':
        cookie.path = attrValue || '/';
        break;
      case 'expires':
        cookie.expires = parseExpires(attrValue);
        break;
      case 'max-age': {
        const maxAge = parseInt(attrValue, 10);
        if (!isNaN(maxAge)) cookie.expires = Date.now() + maxAge * 1000;
        break;
      }
      case 'secure':
        cookie.secure = true;
        break;
      case 'httponly':
        cookie.httpOnly = true;
        break;
    }
  }

  return cookie;
}

function parseExpires(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  const ts = Date.parse(dateStr);
  return isNaN(ts) ? undefined : ts;
}

/**
 * 由 Cookie 数组构建发往 url 的 Cookie 请求头，自动按过期时间、
 * Secure、域名（含子域名）与路径前缀过滤。
 */
export function buildCookieHeader(cookies: Cookie[], url: string): string {
  const domain = extractDomain(url);
  const path = extractPath(url);
  const isSecure = url.startsWith('https');
  const now = Date.now();

  const matching = cookies.filter((c) => {
    if (c.expires !== undefined && c.expires < now) return false;
    if (c.secure && !isSecure) return false;
    if (!domainMatches(domain, c.domain)) return false;
    if (!pathMatches(path, c.path)) return false;
    return true;
  });

  return matching.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** 请求域名等于 Cookie 域名或为其子域名 */
function domainMatches(requestDomain: string, cookieDomain: string): boolean {
  if (requestDomain === cookieDomain) return true;
  return requestDomain.endsWith('.' + cookieDomain);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (requestPath.startsWith(cookiePath)) {
    return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
  }
  return false;
}

// 手工解析而非用 URL 对象：QuickJS 的 URL polyfill 对畸形输入较敏感，
// 这里只需要 host 与 path，手工切更稳。
function extractDomain(url: string): string {
  let host = url;
  const protoIdx = host.indexOf('://');
  if (protoIdx !== -1) host = host.slice(protoIdx + 3);
  const slashIdx = host.indexOf('/');
  if (slashIdx !== -1) host = host.slice(0, slashIdx);
  const colonIdx = host.lastIndexOf(':');
  if (colonIdx !== -1) host = host.slice(0, colonIdx);
  return host.toLowerCase();
}

function extractPath(url: string): string {
  let rest = url;
  const protoIdx = rest.indexOf('://');
  if (protoIdx !== -1) rest = rest.slice(protoIdx + 3);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return '/';
  const path = rest.slice(slashIdx);
  const qIdx = path.indexOf('?');
  if (qIdx !== -1) return path.slice(0, qIdx);
  const hIdx = path.indexOf('#');
  if (hIdx !== -1) return path.slice(0, hIdx);
  return path;
}

/**
 * 跨域名 Cookie 存储。适用于「登录流程跨多个域名跳转、需逐跳收集并回带 Cookie」的场景。
 *
 * 注意宿主的 fetch **不会**自动带 Cookie，需自行 `getCookieHeader(url)` 塞进请求头。
 */
export class CookieJar {
  private cookies: Cookie[] = [];

  /** 添加 Cookie；同名同域同路径会被覆盖，空值或已过期视为删除 */
  add(newCookies: Cookie[]): void {
    for (const nc of newCookies) {
      if (nc.value === '' || (nc.expires !== undefined && nc.expires < Date.now())) {
        this.cookies = this.cookies.filter(
          (c) => !(c.name === nc.name && c.domain === nc.domain && c.path === nc.path)
        );
        continue;
      }
      const idx = this.cookies.findIndex(
        (c) => c.name === nc.name && c.domain === nc.domain && c.path === nc.path
      );
      if (idx !== -1) {
        this.cookies[idx] = nc;
      } else {
        this.cookies.push(nc);
      }
    }
  }

  /** 从 Set-Cookie 响应头原始值数组解析并添加 */
  addFromHeaders(setCookieHeaders: string[], requestUrl: string): void {
    this.add(parseSetCookie(setCookieHeaders, requestUrl));
  }

  /** 直接从 fetch 的 Response 收集 Set-Cookie（内部用 getSetCookie 做宿主兼容） */
  addFromResponse(resp: unknown, requestUrl: string): void {
    const raw = getSetCookie(resp);
    if (raw.length) this.addFromHeaders(raw, requestUrl);
  }

  /** 取匹配目标 URL 的 Cookie 请求头 */
  getCookieHeader(url: string): string {
    return buildCookieHeader(this.cookies, url);
  }

  getByDomain(domain: string): Cookie[] {
    return this.cookies.filter((c) => domainMatches(domain, c.domain));
  }

  /** 当前 Cookie 名称列表（诊断日志用，不含值） */
  getNames(domain?: string): string[] {
    const names = this.cookies
      .filter((c) => !domain || domainMatches(domain, c.domain))
      .map((c) => c.name);
    return Array.from(new Set(names)).sort();
  }

  getValue(name: string, domain?: string): string | undefined {
    const found = this.cookies.find((c) => {
      if (c.name !== name) return false;
      if (domain && !domainMatches(domain, c.domain)) return false;
      return true;
    });
    return found?.value;
  }

  clear(): void {
    this.cookies = [];
  }

  clearDomain(domain: string): void {
    this.cookies = this.cookies.filter((c) => c.domain !== domain);
  }

  purgeExpired(): void {
    const now = Date.now();
    this.cookies = this.cookies.filter((c) => c.expires === undefined || c.expires >= now);
  }

  /** 导出用于持久化（如 songloft.storage） */
  export(): Cookie[] {
    return [...this.cookies];
  }

  /** 从持久化数据恢复 */
  import(cookies: Cookie[]): void {
    this.cookies = [...cookies];
  }

  get size(): number {
    return this.cookies.length;
  }
}
