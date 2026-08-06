<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { state, loadSongs } from './store.js';
import { mode, applyMode, installLayout, onResize, measureListHeight, pageBottomGap } from './layout.js';
import { isWebFRuntime } from './engine.js';
import SlButton from './ui/SlButton.vue';
import SlIcon from './ui/SlIcon.vue';
import SlInput from './ui/SlInput.vue';
import SlSwitch from './ui/SlSwitch.vue';
import SlCheckbox from './ui/SlCheckbox.vue';
import SlSelect from './ui/SlSelect.vue';
import SlListView from './ui/SlListView.vue';

// ── 这是一个「WebF 原生渲染」推荐模板的演示页 ─────────────────────────────────
//
// 它把几件事凑在一起做示范，替换成你自己的业务时可逐块删改：
//   · 三种打开方式（tab / fullscreen / browser）下页头的自绘与否（见 layout.js）；
//   · 全套表单控件包装（ui/Sl*.vue）——同一套业务代码在 WebF 与浏览器两条分支都能跑；
//   · 设置页用**覆盖层**而非 v-if 换页（避免 WebF 大规模拆除渲染树导致的白屏）；
//   · 硬件返回键对接（onHostBack）；
//   · <webf-list-view> 的确定高度由 JS 实测（measureListHeight）。

const page = ref('main'); // 'main' | 'settings'
const listRef = ref(null);

const selectOptions = [
  { value: 'a', label: '选项 A' },
  { value: 'b', label: '选项 B' },
  { value: 'c', label: '选项 C' },
];

// ── 列表高度实测（约束 ⑤）────────────────────────────────────────────────────
// WebF 异步渲染，首帧可能量到 top=0，故失败就下一帧重试几次。
function remeasure(retries = 8) {
  const inst = listRef.value;
  const el = inst && (inst.$el || inst);
  if (measureListHeight(el, pageBottomGap())) return;
  if (retries > 0) requestAnimationFrame(() => remeasure(retries - 1));
}

// ── 返回键：让硬件返回键先退回主页（见下方注释）──────────────────────────────
//
// WebF 不实现 SPA history 路由，也不 fire popstate，所以**不要**用 history.pushState
// （宿主返回键会认定已被消费而变成死键）。宿主提供 `onHostBack`：返回 true 表示本次返回
// 由页面消费。只对 WebF 生效；其它环境返回键直接离开插件页，页头返回按钮在所有模式下都在。
function installBackIntegration() {
  if (!isWebFRuntime) return;
  const P = window.SongloftPlugin;
  if (!P || typeof P.onHostBack !== 'function') return; // 老客户端优雅降级
  P.onHostBack(() => {
    if (page.value !== 'main') {
      page.value = 'main';
      return true;
    }
    return false;
  });
}

onMounted(() => {
  // 判定打开方式要在 mount 之后：window.webf / flutter_inappwebview 的注入时序没有契约。
  applyMode();
  installLayout();
  installBackIntegration();
  onResize(() => remeasure());
  loadSongs().then(() => nextTick(() => remeasure()));
  nextTick(() => remeasure());
});

onUnmounted(() => {});
</script>

<template>
  <div class="sl-container">
    <!-- tab / browser 模式自绘页头；fullscreen 模式宿主已有 AppBar，不画避免双标题。 -->
    <div v-if="mode !== 'fullscreen'" class="sl-appbar">
      <span class="sl-appbar-title">{{name}}</span>
      <SlButton icon-only icon="settings" label="设置" @click="page = 'settings'" />
    </div>
    <div v-else style="text-align: right">
      <SlButton icon-only icon="settings" label="设置" @click="page = 'settings'" />
    </div>

    <!-- 演示卡片：各表单控件（两条渲染分支同一套代码）。 -->
    <div class="card sl-card">
      <div class="sl-card-body">
        <div class="sl-section-title">表单控件示例</div>

        <div class="sl-switch-row">
          <span class="sl-switch-label">开关（SlSwitch）</span>
          <SlSwitch v-model="state.demoSwitch" aria-label="演示开关" />
        </div>

        <div class="sl-switch-row">
          <span class="sl-switch-label">复选框（SlCheckbox）</span>
          <SlCheckbox v-model="state.demoChecked" aria-label="演示复选框" />
        </div>

        <div class="sl-field">
          <label class="sl-field-label">文本输入（SlInput）</label>
          <SlInput v-model="state.demoText" placeholder="输入点什么…" aria-label="演示输入" />
        </div>

        <div class="sl-field">
          <label class="sl-field-label">下拉选择（SlSelect）</label>
          <SlSelect v-model="state.demoSelect" :options="selectOptions" placeholder="请选择" aria-label="演示下拉" />
        </div>

        <SlButton variant="filled" label="重新加载歌曲" icon="refresh" @click="loadSongs" />
      </div>
    </div>

    <!-- 歌曲列表：<webf-list-view> 高度由 JS 实测（约束 ⑤）。 -->
    <div class="sl-section-title">歌曲（来自后端 /songs）</div>
    <SlListView ref="listRef">
      <div v-if="state.loading" class="sl-empty">加载中…</div>
      <div v-else-if="state.songs.length === 0" class="sl-empty">暂无歌曲</div>
      <div v-for="song in state.songs" :key="song.id" class="sl-row">
        <div class="sl-row-main">
          <span class="sl-title" :title="song.title">{{ song.title }}</span>
          <span class="sl-sub" :title="song.artist">{{ song.artist }}</span>
        </div>
      </div>
    </SlListView>
  </div>

  <!--
    设置页用覆盖层（v-if 只挂设置页那几件控件），主页始终挂在底下。
    ⚠️ 不要用 v-if 在主页/设置页之间整片切换：WebF 的大规模渲染树拆除会留下已 dispose
    却仍被引用的 render object，触发每帧刷断言 → 整页白屏。覆盖层是纯挂载/纯卸载，安全。
  -->
  <div v-if="page === 'settings'" class="sl-page-overlay">
    <div class="sl-container">
      <div class="sl-appbar">
        <SlButton icon-only icon="back" label="返回" @click="page = 'main'" />
        <span class="sl-appbar-title">设置</span>
      </div>
      <div class="card sl-card">
        <div class="sl-card-body">
          <div class="sl-empty">在这里放你的设置项。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 设置页覆盖层：fixed 四边分开写（inset 简写是 chrome61 之后语法）；不用 transform（约束 ③）；
 * 底色不透明（surface）否则露出底下主页。 */
.sl-page-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 100;
  background: var(--md-surface);
  overflow-y: auto;
}
</style>
