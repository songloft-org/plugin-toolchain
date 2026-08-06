<script setup>
// 纵向滚动列表容器。
//
// WebF 分支用 <webf-list-view> —— 它是 **webf 包内建**的元素（不依赖 webf_cupertino_ui），
// 直接映射到 Flutter 的 ListView，自带 view 回收。走 ListView 后行高由 Flutter 排版决定，
// 绕开了 CSS grid `auto` 行高在 CJK 下被按「每字一行」测量、以及 position:sticky 全局失效
// 这两个最难缠的坑。
//
// ⚠️ 两条硬约束：
//
//   ① **列表项必须是本元素的直接子节点** —— Flutter ListView 靠此做回收。
//      Vue 的 <slot/> 不产生包裹元素，所以 `<SlListView><Row v-for=.../></SlListView>`
//      是对的；**不要**在中间套 div。
//
//   ② **shrink-wrap 默认是 true，必须显式关掉**。true 时列表高度等于内容总高、不在内部
//      滚动，几百行会一路撑下去。关掉后必须给它**确定的高度**（见 style.css 的 .sl-listview，
//      权威值由 layout.js measureListHeight 实测覆盖），不能留无界约束 —— WebF 在无界约束
//      下解析 flex 会触发 `Infinity or NaN toInt`。
//
// 若要做分页加载，onLoadMore 里**必须**调 finishLoad('success'|'noMore'|'fail')，否则加载
// 指示器会永久转圈。
import { useNativeListView } from '../engine.js';
</script>

<template>
  <webf-list-view
    v-if="useNativeListView"
    class="sl-listview"
    shrink-wrap="false"
    scroll-direction="vertical"
  >
    <slot />
  </webf-list-view>
  <div v-else class="sl-listview">
    <slot />
  </div>
</template>
