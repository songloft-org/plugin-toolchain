/**
 * {{name}} — 前端入口
 */
import { apiGet } from './common.js';

async function init() {
    const output = document.getElementById('output');
    try {
        const data = await apiGet('/api/hello');
        output.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        output.textContent = '加载失败: ' + err.message;
        output.style.color = '#ef4444';
    }
}

document.addEventListener('DOMContentLoaded', init);
