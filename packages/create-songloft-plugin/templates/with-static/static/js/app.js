/**
 * {{name}} — 前端入口
 *
 * SongloftPlugin 全局对象由主程序自动注入，提供：
 *   apiGet / apiPost / apiPut / apiDelete — API 请求
 *   getTheme / onThemeChange — 主题管理
 *   getAuthToken — 认证 Token
 */
const { apiGet, getTheme, onThemeChange } = SongloftPlugin;

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

document.addEventListener('DOMContentLoaded', init);
