// 前端悬浮球V1：基于 0615悬浮球 解耦重构的版本。
// 把状态栏从"楼层 iframe 注入正则"模式改为"以悬浮球+可拖拽缩放窗口"形式挂在酒馆主页面上。
//
// - 挂载点：window.parent.document.body（脚本.mdc 推荐的"独立组件 - 与酒馆样式隔离"模式）
// - 样式隔离：Vue <style scoped> + teleportStyle() 将本脚本 iframe 的 <head> 样式复制到主页面 <head>
// - 数据通道：复用酒馆助手变量 API / MVU API；状态栏内部逻辑由 status-bar-init.ts 提供
import { createScriptIdDiv, teleportStyle } from '@util/script';
import { createApp, type App } from 'vue';
import Shell from './Shell.vue';
import './status-bar.css';

$(() => {
  let app: App | null = null;
  let $mount: JQuery<HTMLElement> | null = null;
  let styleHandle: { destroy: () => void } | null = null;

  try {
    app = createApp(Shell).use(createPinia());
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
