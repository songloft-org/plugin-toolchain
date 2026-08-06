import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

// 宿主注入的 common.js 是 render-blocking 且在 <head>，而本脚本被 builder 挪到
// </body> 之前，所以到这里 window.SongloftPlugin 一定已存在。仍做一次断言：
// 万一注入链路出问题，让失败带上可归因信息，而不是在别处抛
// "Cannot read properties of undefined"。
if (!window.SongloftPlugin) {
  document.getElementById('app').textContent =
    '宿主脚本未注入（window.SongloftPlugin 不存在），插件页无法工作。';
} else {
  createApp(App).mount('#app');
}
