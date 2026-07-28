// 校验 prod 产物里所有 CDN 外部依赖的具名导入，在 CDN 上真实存在。
//
// 为什么必须有这个检查：production 打包开 usedExports，webpack 出的是逐名导入
// `import{AlignLeft as t,Apple as e,…}from'https://…/lucide-static/+esm'`。
// 浏览器在**模块解析期**校验每一个具名 export，缺一个就抛
// `SyntaxError: The requested module … does not provide an export named 'X'`，
// 于是**整个模块一行都不执行**——表现为悬浮球/状态栏整体消失，而不是掉一个图标。
// dev 打包出的是命名空间导入 `import * as NS`，缺名只是 undefined，运行时防御能吞掉，
// 所以「dev 能跑」完全不能证明导入名是对的。2026-07-28 就是这样炸的：
// icons.ts 里 `CircleHalf`、`Stream` 两个名字 lucide-static 根本没有，潜伏很久。
//
// 用法（先 pnpm build，再跑）：
//   node scripts/check_cdn_imports.mjs
//   node scripts/check_cdn_imports.mjs dist/前端悬浮球V1/index.js
// 退出码：0 = 全部存在；1 = 有不存在的导入名（列出来）；2 = 脚本/网络自身出错。

import fs from 'node:fs';
import path from 'node:path';

// Node 默认 ESM loader 不允许 import 'https://…'（只支持 file/data），
// 所以这里 fetch 文本再解析它的 `export{a as Foo,b as Bar}` 子句拿导出名。
// jsdelivr 的 `+esm` 产物都是单个 export 子句结尾，无 `export * from`（已验证四个依赖）。
async function fetchExportNames(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  const names = new Set();
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      // `a as Foo` → Foo；`Foo` → Foo
      const seg = p.split(/\s+as\s+/);
      names.add((seg[1] ?? seg[0]).trim());
    }
  }
  if (/export\s*\*\s*from/.test(text)) {
    console.warn(`[WARN] ${url} 含 \`export * from\`，转发的导出名本脚本抓不到，可能误报缺失。`);
  }
  if (names.size === 0) throw new Error('未能从 +esm 产物里解析出任何 export 名');
  return names;
}

const target = process.argv[2] ?? 'dist/前端悬浮球V1/index.js';

if (!fs.existsSync(target)) {
  console.error(`[FAIL] 找不到产物 ${target}，先跑 pnpm build`);
  process.exit(2);
}

const code = fs.readFileSync(target, 'utf-8');

// 抓 import{a as x,b as y}from'URL' —— 只关心 http(s) 外部依赖，本地模块已被打进产物
const byUrl = new Map();
const re = /import\{([^}]*)\}from["'](https?:\/\/[^"']+)["']/g;
for (const m of code.matchAll(re)) {
  const names = m[1]
    .split(',')
    .map(p => p.trim().split(' as ')[0].trim())
    .filter(Boolean);
  const list = byUrl.get(m[2]) ?? [];
  list.push(...names);
  byUrl.set(m[2], list);
}

if (byUrl.size === 0) {
  console.log(
    `[SKIP] ${path.basename(target)} 里没有 CDN 逐名导入。\n` +
      '       dev 产物走命名空间导入，本检查只对 pnpm build（production）产物有意义。',
  );
  process.exit(0);
}

let bad = 0;
let checked = 0;

for (const [url, rawNames] of byUrl) {
  const names = [...new Set(rawNames)].sort();
  let exported;
  try {
    exported = await fetchExportNames(url);
  } catch (err) {
    console.error(`[FAIL] 无法加载 ${url}\n       ${err.message}`);
    process.exit(2);
  }
  const missing = names.filter(n => !exported.has(n));
  checked += names.length;
  const short = url.replace(/^https?:\/\/[^/]+\//, '');
  if (missing.length) {
    bad += missing.length;
    console.error(`[FAIL] ${short}\n       缺少 ${missing.length} 个 export: ${missing.join(', ')}`);
  } else {
    console.log(`[ OK ] ${short} — ${names.length} 个导入名全部存在（CDN 共 ${exported.size} 个 export）`);
  }
}

if (bad) {
  console.error(
    `\n[FAIL] 共 ${bad} 个不存在的导入名。这会让 prod 产物在浏览器解析期抛 SyntaxError，` +
      '整个界面不显示。请改成 CDN 上真实存在的名字后重新 pnpm build。',
  );
  process.exit(1);
}

console.log(`\n[PASS] ${byUrl.size} 个 CDN 依赖、共 ${checked} 个具名导入全部存在。`);
