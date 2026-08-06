<script setup>
import { ref } from 'vue';
import { useNativeUI } from '../engine.js';
import { bindNativeProps } from './native-props.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const el = ref(null);
// 布尔属性走命令式赋值（见 native-props.js）。cupertino checkbox 的 aria 入口是
// semanticLabel（HTML 属性名 semantic-label）。
bindNativeProps(el, () => ({
  checked: props.modelValue,
  disabled: props.disabled,
  semanticLabel: props.ariaLabel || null,
}));

function onNativeChange(e) {
  emit('update:modelValue', !!e.detail);
}
function onHtmlChange(e) {
  emit('update:modelValue', e.target.checked);
}
</script>

<template>
  <flutter-cupertino-checkbox
    v-if="useNativeUI"
    ref="el"
    class="sl-cb-native"
    @change="onNativeChange"
  />
  <input
    v-else
    type="checkbox"
    class="sl-cb"
    :checked="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel || undefined"
    @change="onHtmlChange"
  />
</template>
