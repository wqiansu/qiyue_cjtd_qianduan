// 前端悬浮球V1：状态栏以悬浮球+可拖拽缩放窗口挂在酒馆主页面 body（parent document）。
// 脚本运行在后台 iframe 内，故挂载点、样式复制、数据访问都作用于 window.parent（脚本.mdc 的"独立组件"模式）。
import { createScriptIdDiv, teleportStyle } from '@util/script';
import { createApp, type App } from 'vue';
import Shell from './Shell.vue';
import './status-bar.css';

$(() => {
  let app: App | null = null;
  let $mount: JQuery<HTMLElement> | null = null;
  let styleHandle: { destroy: () => void } | null = null;

  try {
    app = createApp(Shell);
    // 挂载到酒馆主页面 body，position: fixed 让悬浮球/面板始终漂浮在视口上
    $mount = createScriptIdDiv().appendTo($('body', window.parent.document)) as JQuery<HTMLElement>;
    app.mount($mount[0]);
    // 把本脚本 iframe head 内 webpack 注入的样式复制到主页面 head（包括 status-bar.css 与 Shell.vue 的 scoped 样式）
    styleHandle = teleportStyle($('head', window.parent.document));
  } catch (e) {
    console.error('[前端悬浮球V1] 加载失败：', e);
  }

  $(window).on('pagehide', () => {
    try { app?.unmount(); } catch (e) { void e; }
    try { $mount?.remove(); } catch (e) { void e; }
    try { styleHandle?.destroy(); } catch (e) { void e; }
    app = null; $mount = null; styleHandle = null;
  });
});
