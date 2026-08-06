<script setup>
import { computed } from 'vue';
import SlIcon from './SlIcon.vue';

// **单一 HTML 实现**：不走 <flutter-cupertino-button> 双分支，统一用宿主 components.css
// 的 M3 按钮类（.btn / .btn-filled / .btn-outlined / .btn-text），与主程序
// FilledButton / OutlinedButton / TextButton 一致，自动跟随主题。
//
// ⚠️ WebF 约束（见 style.css 文件头 ⑦⑧）：
//   · 图标按钮落点（页头 / 工具栏）多是 flex 容器，`.btn` 是 inline-flex，flex 里套
//     flex 会整个子树不绘制 → 图标按钮改用 `.sl-btn-icon`（inline-block）。
//   · 按钮内容层 `.sl-btn-inner` 必须 inline-flex（不能 flex），否则宽度撑满整行。
const props = defineProps({
  /** 'filled' | 'tinted' | 'plain' */
  variant: { type: String, default: 'plain' },
  disabled: { type: Boolean, default: false },
  /** 按钮文字；iconOnly 时当 aria-label 用 */
  label: { type: String, required: true },
  /** 可选前置图标，取值见 SlIcon 的 MAP */
  icon: { type: String, default: '' },
  /** 可选后置图标（文字之后） */
  trailingIcon: { type: String, default: '' },
  /** 只画图标、不画文字（页头齿轮 / 返回箭头），label 仍必填当 aria-label */
  iconOnly: { type: Boolean, default: false },
});

// tinted 映射到描边按钮（OutlinedButton），语义与 M3 一致。
const VARIANT_CLASS = {
  filled: 'btn btn-filled',
  tinted: 'btn btn-outlined',
  plain: 'btn btn-text',
};

const btnClass = computed(() => {
  // 图标按钮刻意不带宿主 `.btn`：`.btn` 是 inline-flex，落在 flex 容器里会触发约束 ⑧。
  // `.sl-btn-icon` 是 inline-block，安全。
  if (props.iconOnly) return 'sl-btn-icon';
  return VARIANT_CLASS[props.variant] || VARIANT_CLASS.plain;
});
</script>

<template>
  <button type="button" :class="btnClass" :disabled="disabled" :aria-label="label">
    <span class="sl-btn-inner">
      <SlIcon v-if="icon" :name="icon" />
      <span v-if="!iconOnly" class="sl-btn-label">{{ label }}</span>
      <SlIcon v-if="trailingIcon" :name="trailingIcon" />
    </span>
  </button>
</template>
