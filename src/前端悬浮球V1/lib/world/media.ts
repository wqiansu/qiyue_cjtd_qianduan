// 世界套件 P0 · 文生图后端（media.ts）
// 职责：tryGenImage(prompt) —— iframe 内直 fetch comfyui HTTP API（POST /prompt → 轮询 /history/{id} → 取图）。
// 降级铁律（§10.10）：未启用 / 未配置工作流 / 连不上 / 超时 → 返回 null，绝不 throw、绝不阻塞主流程。
// 不含 TTS（用户拍板不做）。
import { getWorldConfig } from './world-store';

export type GenImageResult = { url: string; via: 'comfyui' } | null;

// 工作流模板里用 {{prompt}} 占位；替换为转义后的用户提示词（保证 JSON 合法）。
function injectPrompt(workflowJson: string, prompt: string): any | null {
  try {
    const safe = JSON.stringify(prompt).slice(1, -1); // 去掉首尾引号，留转义内容
    const filled = workflowJson.replace(/\{\{\s*prompt\s*\}\}/g, safe);
    return JSON.parse(filled);
  } catch (e) { void e; return null; }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

// 轮询 /history/{promptId} 直到出图或超时（默认 60s）。取第一张图的 view URL。
async function pollHistory(base: string, promptId: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(joinUrl(base, `/history/${encodeURIComponent(promptId)}`), { method: 'GET' });
      if (r.ok) {
        const hist = await r.json();
        const entry = hist?.[promptId];
        const outputs = entry?.outputs || {};
        for (const nodeId of Object.keys(outputs)) {
          const imgs = outputs[nodeId]?.images;
          if (Array.isArray(imgs) && imgs.length) {
            const im = imgs[0];
            const q = new URLSearchParams({ filename: im.filename, subfolder: im.subfolder || '', type: im.type || 'output' });
            return joinUrl(base, `/view?${q.toString()}`);
          }
        }
      }
    } catch (e) { void e; /* 连接抖动，继续轮询直到超时 */ }
    await new Promise(res => setTimeout(res, 1500));
  }
  return null;
}

// 主入口：尝试生成图片。任何失败路径都返回 null（上层 UI 文字占位）。
export async function tryGenImage(prompt: string, opts?: { timeoutMs?: number }): Promise<GenImageResult> {
  const cfg = getWorldConfig().comfyui;
  if (!cfg.enabled) return null;
  if (!cfg.url || !cfg.workflowJson.trim()) return null;
  const workflow = injectPrompt(cfg.workflowJson, prompt);
  if (!workflow) { try { (window as any).toastr?.warning?.('文生图工作流 JSON 无效'); } catch (e) { void e; } return null; }
  try {
    const submit = await fetch(joinUrl(cfg.url, '/prompt'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });
    if (!submit.ok) return null;
    const data = await submit.json();
    const promptId = data?.prompt_id;
    if (!promptId) return null;
    const url = await pollHistory(cfg.url, promptId, opts?.timeoutMs ?? 60000);
    return url ? { url, via: 'comfyui' } : null;
  } catch (e) {
    void e;
    return null; // 连不上 comfyui：降级占位，不报错
  }
}

// 后端是否已就绪（启用 + 有地址 + 有工作流）。UI 据此显示「出图」按钮或「未配置」提示。
export function isImageBackendReady(): boolean {
  const cfg = getWorldConfig().comfyui;
  return !!(cfg.enabled && cfg.url && cfg.workflowJson.trim());
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_media__ = { tryGenImage, isImageBackendReady };
} catch (e) { void e; }
