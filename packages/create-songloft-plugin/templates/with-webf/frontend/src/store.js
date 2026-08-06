// 全局状态。用 Vue 的 reactive 而非 pinia：插件页通常足够简单，一个模块级 reactive
// 对象就够了；需要更强的状态管理时再自行引入。
//
// ⚠️ 模块级单例（在这里 new 一次）—— 不要把它写进某个组件的 `<script setup>` 顶层，
// 那样会每个实例各一份（同 layout.js / select-open-state.js 的理由）。

import { reactive } from 'vue';
import { fetchSongs } from './api.js';

export const state = reactive({
  songs: [],
  loading: false,
  // 演示各表单控件的双向绑定：
  demoSwitch: true,
  demoChecked: false,
  demoText: '',
  demoSelect: '',
});

export async function loadSongs() {
  state.loading = true;
  try {
    const res = await fetchSongs();
    // base/src/main.ts 的 /songs 返回 { count, songs }
    state.songs = (res && res.songs) || [];
  } finally {
    state.loading = false;
  }
}
