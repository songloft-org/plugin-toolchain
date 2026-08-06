import { ref } from 'vue';

/**
 * 「当前展开的是哪个下拉」——**所有 SlSelect 实例共享的一份**状态。
 *
 * ── 为什么必须放在独立模块里 ────────────────────────────────────────────────
 *
 * 因为 **`<script setup>` 的顶层变量不是模块级的**。整个 `<script setup>` 体会被编译进
 * 组件的 `setup()` 函数，所以在那里写 `const openToken = ref(null)` 会**每个实例各建一份**
 * —— 多个下拉各有各的 token，互斥完全不生效。放到普通 `.js` 模块里，模块只求值一次，
 * 作用域语义没有任何歧义。
 *
 * 用法：每个实例领一个 `nextSelectToken()`，展开时把 `openToken` 赋成自己的 token。
 * 「展开自己」和「收起别人」因此是同一个动作。
 */
export const openToken = ref(null);

let seq = 0;

/** 领取一个实例身份。用自增整数（QuickJS 侧没必要多依赖 Symbol，整数已足够唯一）。 */
export function nextSelectToken() {
  return ++seq;
}
