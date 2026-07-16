/**
 * {{name}} — 前端入口
 *
 * SongloftPlugin 全局对象由主程序自动注入，提供：
 *   apiGet / apiPost / apiPut / apiDelete — API 请求
 *   getTheme / onThemeChange — 主题管理
 *   getAuthToken — 认证 Token
 *   host / player — 客户端能力（仅在 Songloft 客户端 webview 中打开时可用）
 *
 * 客户端 SDK（@songloft/client-sdk）用法见：
 *   https://github.com/songloft-org/plugin-toolchain/tree/main/packages/client-sdk
 */
const { apiGet, getTheme, onThemeChange, host, player } = SongloftPlugin;

async function init() {
    const output = document.getElementById('output');
    try {
        const data = await apiGet('/api/hello');
        output.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        output.textContent = '加载失败: ' + err.message;
        output.style.color = 'var(--md-error)';
    }
}

/**
 * 客户端 SDK 示例：把一批歌曲加入宿主的「正在播放队列」。
 * 页面在 Songloft 客户端 webview / Web 端 Tab 内嵌（iframe）中打开时 host.isAvailable() 为 true。
 * songIds 通常来自你自己的搜索结果（先经服务端 songs.create 持久化后拿到 id）。
 */
async function playInHost(songIds) {
    if (!host || !host.isAvailable()) {
        console.warn('宿主客户端桥接不可用：请在 Songloft 客户端 webview 中打开本页面');
        return;
    }
    // 替换整个队列并从第 0 首开始播放
    await player.setQueue(songIds, { startIndex: 0 });
    // 或仅追加到队列末尾（不打断当前播放）：await player.addToQueue(songIds);
}

document.addEventListener('DOMContentLoaded', init);
