// 与插件后端（src/main.ts 的 router）通信。
//
// 走宿主注入的 window.SongloftPlugin.apiGet / apiPost —— 它们负责补 baseURL、带上
// access_token、并在 WebF / WebView / iframe 三条路径上统一行为。刻意不用裸 fetch：
// 鉴权与 base path 的处理都在宿主那一层。
//
// 端点路径与 src/main.ts 里 router 注册的路径**一一对应**（脚手架默认后端有 /hello、/songs）。

const P = () => window.SongloftPlugin;

/** GET，失败返回 null（宿主的 apiGet 已吞掉网络错误并返回 null）。 */
export function get(path) {
  return P().apiGet(path);
}

export function post(path, body) {
  return P().apiPost(path, body);
}

export function fetchHello() {
  return get('/hello');
}

export function fetchSongs() {
  return get('/songs');
}
