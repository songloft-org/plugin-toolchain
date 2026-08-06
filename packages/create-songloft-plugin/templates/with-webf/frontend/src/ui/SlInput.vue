<script setup>
import { ref } from 'vue';
import { useNativeUI } from '../engine.js';
import { bindNativeProps } from './native-props.js';

const props = defineProps({
  /**
   * 值。**必须是字符串**，不要传数字。
   *
   * ⚠️ 两条渲染分支对它的用法**不对称**：
   * - HTML 分支：受控（`:value="modelValue"`）。浏览器 / WebView 没有下面这条崩溃链。
   * - 原生分支：**只作挂载初值，挂载后永不回写**（非受控）。
   *   `<flutter-cupertino-input>` 是受控 widget，任何落到已挂载元素上的 `val` 回写都会
   *   触发 RenderEditable 重排；若同一帧鼠标正停在输入框上做 hit test，会撞
   *   `Text layout not available` 断言 → 之后每帧刷断言 → 整页白屏（已实测）。
   *   外部确实需要改显示值时，调用方改 `:key` 让本组件**重挂载**（新值走 mount 而非 update）。
   *   数字字段请在 store 里存字符串、提交时才 parseInt。
   */
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  /** 'text' | 'password' | 'number' | 'tel' | 'email' | 'url' */
  type: { type: String, default: 'text' },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue', 'change']);

// 挂载初值快照。**刻意不是响应式**：只在 setup 时取一次 —— 这正是「非受控」的实现，
// 于是永远不会有第二次 `val` 写入落到已挂载的原生元素上，上面那条崩溃链从构造上消失。
// 输入事件照常 emit（store 仍是实时的）。重挂载（换 `:key`）会重跑 setup、重新快照。
const initialValue = props.modelValue;

const el = ref(null);
bindNativeProps(el, () => ({
  disabled: props.disabled,
  clearable: props.clearable,
}));

// cupertino input 的 input 事件：CustomEvent('input', detail: string)
function onNativeInput(e) {
  emit('update:modelValue', e.detail == null ? '' : String(e.detail));
}
function onHtmlInput(e) {
  emit('update:modelValue', e.target.value);
}
</script>

<template>
  <!--
    原生分支：`:val` 绑的是**常量快照** initialValue 而不是 modelValue，理由见上。
    属性名是 `val` 而不是 `value`。cupertino input **没有 change 事件**，只有
    input/submit/blur —— 「change 即保存」由调用方在 blur 或 input 去抖后自己触发。
  -->
  <flutter-cupertino-input
    v-if="useNativeUI"
    ref="el"
    class="sl-input-native"
    :val="initialValue"
    :placeholder="placeholder"
    :type="type"
    @input="onNativeInput"
    @blur="emit('change')"
  />
  <input
    v-else
    class="sl-input"
    :value="modelValue"
    :placeholder="placeholder"
    :type="type"
    :disabled="disabled"
    :aria-label="ariaLabel || undefined"
    @input="onHtmlInput"
    @change="emit('change')"
  />
</template>
