// 布局环境：打开方式、列表可用高度、resize 钩子。
//
// ⚠️ **必须是独立模块**（同 ui/select-open-state.js 的理由）：`<script setup>` 顶层的
// `const` 会被编译进 `setup()`，那是**每个组件实例一份**。这里的东西都必须全页唯一，
// 放进组件里会静默变成「各组件各看到一份」。

import { ref } from 'vue';

// ── 打开方式 ───────────────────────────────────────────────────────────────
//
// 插件页有三种打开方式，宿主给的 chrome 完全不同，页头要不要自己画取决于它：
//
//   tab        注册成主程序 tab（URL 带 `embed`）。宿主**没有** AppBar，
//              底部是 Flutter 的 NavigationBar。→ 页头要自己画。
//   fullscreen 从首页点进的全屏页。宿主**有** AppBar（插件名 / 返回 / 关闭 /
//              在浏览器打开）。→ 页头不能自己画，否则双标题。
//   browser    从上面那个全屏页「在浏览器中打开」跳出去。完全裸页面。→ 页头必须自己画。
//
// 判据：`embed` class 由 common.js 在 <head> 同步阶段加上；fullscreen 与 browser 的
// URL 逐字节相同，唯一可靠判据是 `SongloftPlugin.host.isAvailable()`（把 WebF
// methodChannel / native callHandler / iframe parent 三条传输链路 OR 在一起）。
export const mode = ref('browser');

export function detectMode() {
  if (document.documentElement.classList.contains('embed')) return 'tab';
  // isAvailable() 现算，但 window.webf / window.flutter_inappwebview 的注入时序没有契约，
  // 所以调用点放在 mount 之后（见 App.vue），不在模块初始化时。
  try {
    const h = window.SongloftPlugin && window.SongloftPlugin.host;
    if (h && h.isAvailable()) return 'fullscreen';
  } catch (e) {
    /* 探测失败按「没有宿主」处理：多画一个页头比少一个入口好 */
  }
  return 'browser';
}

/**
 * 把判定结果同步到 `<html>` 的 class，供 CSS 分三套布局用。
 * 用自定义的 `sl-mode-*` 而不是复用宿主的类：宿主 `html.embed` 那段全带 `!important`，
 * 自己的类不带才好覆盖。
 */
export function applyMode() {
  const m = detectMode();
  mode.value = m;
  const de = document.documentElement;
  de.classList.remove('sl-mode-tab', 'sl-mode-fullscreen', 'sl-mode-browser');
  de.classList.add('sl-mode-' + m);
  return m;
}

// ── 列表可用高度 ───────────────────────────────────────────────────────────
//
// WebF 约束：`<webf-list-view shrink-wrap="false">` 必须有**确定 height**（只能是
// `height`，`max-height` 会把无界约束透进 hosted Flutter 子树，撞 `Infinity or NaN toInt`），
// 而竖向 flex 又不许用（约束 ⑧）。于是只能算：量出列表顶边到视口底的距离，写成内联 height。
// CSS 里有 `calc(100vh - 常量)` 的兜底值保证首帧满足约束，这里以实测为权威覆盖它。
const MIN_LIST_HEIGHT = 240;
const FALLBACK_BOTTOM_PAD = 16;

/**
 * 列表下方到视口底的固定占位（容器 padding-bottom）。必须**读解析值**而不是写死：
 * CSS 里它是 `calc(16px + var(--sl-safe-bottom))`，刘海屏 / 手势条上会大一截。
 * 读 getComputedStyle 的**标准属性**没问题；WebF 只有对**自定义属性**才一律返回空串。
 */
export function pageBottomGap() {
  let pad = FALLBACK_BOTTOM_PAD;
  try {
    const el = document.querySelector('.sl-container');
    if (el && typeof window.getComputedStyle === 'function') {
      const v = parseFloat(window.getComputedStyle(el).paddingBottom);
      if (isFinite(v) && v >= 0) pad = v;
    }
  } catch (e) {
    /* 读不到就用兜底值 */
  }
  return pad;
}

/**
 * @param {HTMLElement|null} el 列表元素（`<webf-list-view>` 或 HTML 回落的 div）
 * @param {number} bottomGap 列表下方要留出的空白，见 pageBottomGap()
 * @returns {boolean} 是否成功写入（首帧未 layout 时返回 false，调用方下一帧重试）
 */
export function measureListHeight(el, bottomGap) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const top = el.getBoundingClientRect().top;
  // WebF 是**异步渲染**的，首帧可能还没 layout、量出来是 0。此时什么都不做，
  // 让 CSS 兜底值继续生效，由调用方在下一帧重试。也不接受负值。
  if (!(top > 0)) return false;
  const h = Math.round(window.innerHeight - top - bottomGap);
  // 只能写内联 style，**不能**读 CSS 变量再算：WebF 的 getComputedStyle 对自定义属性
  // 一律返回空串。
  el.style.height = Math.max(MIN_LIST_HEIGHT, h) + 'px';
  return true;
}

// ── 一次性安装的 resize 监听 ─────────────────────────────────────────────────
//
// 挂在模块级、只装一次：组件会随切页反复挂卸，装在组件里就会漏。
let installed = false;
const resizeHooks = [];

/** 注册一个 resize 回调（用于重量列表高度）。返回反注册函数。 */
export function onResize(fn) {
  resizeHooks.push(fn);
  return () => {
    const i = resizeHooks.indexOf(fn);
    if (i >= 0) resizeHooks.splice(i, 1);
  };
}

export function installLayout() {
  if (installed) return;
  installed = true;
  window.addEventListener('resize', () => {
    for (let i = 0; i < resizeHooks.length; i++) {
      try {
        resizeHooks[i]();
      } catch (e) {
        /* 单个回调出错不该连带打掉其它的 */
      }
    }
  });
}
