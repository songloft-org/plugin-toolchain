<script setup>
import { computed } from 'vue';

// 图标：语义名 → Material Symbols ligature。
//
// **单一 HTML 实现**：不走 <flutter-cupertino-icon> 双分支。Material Symbols 在 WebF 下
// 也可用 —— 宿主用 Flutter FontLoader 预注册了 'Material Symbols Outlined'（绕开 WebF
// 加载 woff2 失败的上游缺陷），字体由宿主提供的完整可变字体渲染，不会退化成字面文字。
// 尺寸/颜色由 CSS（.sl-icon + 落点的 color/font-size）控制。
//
// 在 MAP 里登记你需要的图标（值取 https://fonts.google.com/icons 的 ligature 名）。
const MAP = {
  settings: 'settings',
  refresh: 'refresh',
  download: 'download',
  chevron: 'expand_more',
  back: 'arrow_back',
  check: 'check',
  error: 'error_outline',
  music: 'music_note',
};

const props = defineProps({
  name: { type: String, required: true },
});

const glyph = computed(() => MAP[props.name] || 'help');
</script>

<template>
  <span class="material-symbols-outlined sl-icon" aria-hidden="true">{{ glyph }}</span>
</template>
