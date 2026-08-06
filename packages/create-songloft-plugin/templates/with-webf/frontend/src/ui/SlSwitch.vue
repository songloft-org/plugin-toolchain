<script setup>
// **单一 HTML 实现**：不走 <flutter-cupertino-switch> 双分支，统一用宿主 components.css
// 的 `.switch` 结构，与主程序 M3 Switch 一致。
//
// 采用宿主类的好处：track/thumb 是标准 <span> + `var(--md-*)`，CSS 变量在 WebF 下正常
// 渲染、自动跟随主题，无需任何 JS 读色（cupertino switch 的主色只认字面 hex，反而要
// 用 getColorScheme() 读色再喂进去）。
//
// ⚠️ 宿主 `.switch` 三条写法（display:inline-block + flex-shrink:0、把手 translateX、
//    选中态 `~` 兄弟选择器）由宿主 CSS 提供，勿在插件侧改。
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

function onChange(e) {
  emit('update:modelValue', e.target.checked);
}
</script>

<template>
  <label class="switch">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel || undefined"
      @change="onChange"
    />
    <span class="switch-track"></span>
    <span class="switch-thumb"></span>
  </label>
</template>
