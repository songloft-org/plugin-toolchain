// 渲染引擎能力探测 —— 决定 ui/ 下的包装组件走 webf-ui 原生元素还是 HTML 回落。
//
// ── 为什么是「特性探测」而不是「引擎探测」 ──────────────────────────────────
//
// 直觉写法是 `!!window.webf`，但那是错的。客户端与插件是**各自独立发版**的：
// plugin.json 的 minHostVersion 只约束**服务端**版本，没有任何字段能约束客户端。
// 于是「新插件 + 老客户端（还没有 webf_cupertino_ui）」这个组合必然出现，
// 那时 <flutter-cupertino-*> 会落到 WebF 的空盒子（_UnknownHTMLElement）——
// 用户看到的是**所有控件凭空消失**，而且不报任何错。
//
// 所以判据必须是「这些元素到底注册上了没有」，而不是「我是不是跑在 WebF 里」。
//
// 元素注册上时，webf_cupertino_ui 的 bindings 会在实例上定义 `checked` 属性；
// 没注册上就是空盒子，其上没有这个属性 → undefined。用 switch 做探针是因为它属性
// 最少；任一 cupertino 元素注册失败都是同一个 install 调用整体失败，探一个等于探全部。

/** 是否跑在 WebF 运行时里。判据与宿主 common.js 的 isWebFEngine() 一致。 */
export const isWebFRuntime = typeof window !== 'undefined' && !!window.webf;

function detectNativeUI() {
  if (!isWebFRuntime) return false;
  try {
    return document.createElement('flutter-cupertino-switch').checked !== undefined;
  } catch (e) {
    return false;
  }
}

/**
 * 是否使用 webf-ui 原生元素。
 *
 * 模块级常量：渲染引擎在页面生命周期内不会变，没必要做成响应式。
 * false 时全部包装组件走 HTML 分支 —— 覆盖浏览器 / 系统 WebView / Web iframe，
 * 以及上面说的「老客户端」情形。
 */
export const useNativeUI = detectNativeUI();

/**
 * webf-list-view 是 webf 包**内建**的（不依赖 webf_cupertino_ui），所以它的
 * 可用性与 cupertino 元素是两件事，单独探测。判据：注册上时会定义 finishLoad 方法。
 */
function detectListView() {
  if (!isWebFRuntime) return false;
  try {
    return typeof document.createElement('webf-list-view').finishLoad === 'function';
  } catch (e) {
    return false;
  }
}

export const useNativeListView = detectListView();
