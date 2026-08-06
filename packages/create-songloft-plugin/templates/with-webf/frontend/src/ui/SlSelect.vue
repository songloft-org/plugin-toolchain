<script setup>
// 下拉选择。**这是唯一一处「WebF 下必须换实现」的控件。**
//
// ── 为什么 `<select>` 在 WebF 下不能用 ───────────────────────────────────────
//
// WebF 的 HTMLSelectElement 是一个 WidgetElement，只把 value / selectedIndex /
// disabled / multiple / required 暴露给 JS，**没有 `options`**。而 Vue 的 `v-model`
// 走 vModelSelect 指令，那个指令整个建立在 `el.options` 上（`filter.call(el.options, …)`），
// `filter.call(undefined, …)` 直接抛 TypeError —— **任何框架**的 `<select>` 双向绑定都会踩。
// 绕开 v-model、改显式 `@change` 读 `el.value` 之后实测仍不通（断点在 Dart 侧）。结论：不要碰。
//
// ⚠️ 判据陷阱：「下拉的标签显示更新了」**不能**当成「数据通了」。WebF 的 select 显示文字由
// Flutter 侧维护，与 JS 收不收到值无关。
//
// ── 现在的实现 ──────────────────────────────────────────────────────────────
//
// 触发按钮（SlButton）+ **绝对定位的浮层面板**（v-if 展开，普通 <div> 行）。选中值从头到尾
// 只在我们自己的 JS 里流动：点哪一行就 emit 那一行的 value，不读写任何 WebF 元素属性。
// 选项行是普通 <div>（不嵌 webf-list-view，避免赌 tap 穿过 Flutter ListView 的手势竞技场），
// 面板长时靠页面自身滚动。层叠/命中判据见 style.css 的 .sl-select-panel 注释。
//
// 非 WebF 路径（浏览器 / 系统 WebView / Web iframe）继续用原生 `<select>` —— 在真浏览器里
// 它完全正常，且是无障碍与键盘操作最好的形态。
//
// ⚠️ 闸门是 `isWebFRuntime` 而**不是** `useNativeUI`：`<select>` 在**所有** WebF 上都坏
// （缺 options，值传不回），不只 cupertino 客户端。用 useNativeUI 当闸门会让
// 「WebF + 老客户端（无 cupertino）」落到原生 `<select>` 分支而踩坑。

import { computed, onUnmounted } from 'vue';
import { isWebFRuntime } from '../engine.js';
import SlButton from './SlButton.vue';
import { openToken, nextSelectToken } from './select-open-state.js';

/*
 * 同时只允许一个面板展开：展开状态不是每实例的 `open` 布尔（那样多个下拉能同时张开），
 * 而是共享的「当前归属于谁」（见 select-open-state.js，必须放独立模块）。
 * 刻意**不做**「点面板外收起」：WebF 的 DOM click 由全局唯一 tap recognizer 派发，
 * document 级监听与触发按钮自身 click 的先后顺序未验证，少一个可能自锁的交互更稳。
 */

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** [{ value, label }]，不含占位项 */
  options: { type: Array, default: () => [] },
  /** 空值那一项的文案 */
  placeholder: { type: String, default: '全部' },
  ariaLabel: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const currentLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue);
  return hit ? hit.label : props.placeholder;
});

const rows = computed(() => [{ value: '', label: props.placeholder }, ...props.options]);

const myToken = nextSelectToken();
const open = computed(() => openToken.value === myToken);

onUnmounted(() => {
  if (openToken.value === myToken) openToken.value = null;
});

function toggle() {
  // 赋 token 而不是翻布尔：展开自己的同时把别人收起来，是同一个动作。
  openToken.value = open.value ? null : myToken;
}

function pick(row) {
  openToken.value = null;
  emit('update:modelValue', row.value);
}

// HTML 回落分支：原生 <select>
function onChange(e) {
  const node = e && e.target;
  if (node) emit('update:modelValue', node.value == null ? '' : node.value);
}
</script>

<template>
  <div v-if="isWebFRuntime" class="sl-select-wrap">
    <SlButton
      class="sl-select-btn"
      variant="tinted"
      :label="currentLabel"
      trailing-icon="chevron"
      @click="toggle"
    />
    <!--
      面板用 v-if 而不是 CSS 隐藏：WebF 里 display:none 的元素仍会挂一个 0 尺寸盒子。
      选项行是普通 div（不嵌 webf-list-view，见文件头注释）。
    -->
    <div v-if="open" class="sl-select-panel">
      <div
        v-for="row in rows"
        :key="row.value"
        class="sl-select-option"
        :class="{ 'sl-select-option-on': row.value === modelValue }"
        @click="pick(row)"
      >
        {{ row.label }}
      </div>
    </div>
  </div>
  <select
    v-else
    class="sl-select"
    :value="modelValue"
    :aria-label="ariaLabel || undefined"
    @change="onChange"
  >
    <option value="">{{ placeholder }}</option>
    <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
  </select>
</template>
