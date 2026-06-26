// 解 此间天地.json (chara_card_v3) 为 tavern_sync 文件夹结构
// 参考: tavern_sync.mjs 的 pull 逻辑 +例/角色卡示例/index.yaml 格式
//   - 第一条消息只保留 first_mes, 丢弃 alternate_greetings
//   - content 行数 >3 时外链到文件, 否则内联内容
//   - 第一条消息固定 .txt, 世界书条目 .yaml/.txt (detect_extension), 正则 .txt,本 .js
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const LOG_PATH = path.resolve('tmp/extract_debug.log');
fs.writeFileSync(LOG_PATH, ''); // reset
function log(msg) { const line = `[${new Date().toISOString()}] ${msg}\n`; fs.appendFileSync(LOG_PATH, line); try { process.stderr.write(line); } catch {} }
process.on('uncaughtException', (e) => { log('!! UNCAUGHT: ' + (e && e.stack || e)); process.exit(99); });
process.on('exit', (code) => log(`[exit code=${code}]`));
log('stage0 start; cwd=' + process.cwd());

const ROOT = path.resolve('角色卡工作室/此间天地');
const SRC = path.join(ROOT, '此间天地.json');
console.error('[stage1] reading JSON');
const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const d = raw.data;
const ext = d.extensions || {};
console.error('[stage2] parsed; entries=', d.character_book.entries.length);

// ---- helpers (mirror tavern_sync.mjs) ----
function sanitize_filename(name) {           // win32
  return String(name).replace(/[\s<>:"/\\|?*\x00-\x1F\x7F]/g, '_');
}
function is_yaml(content) {
  try { YAML.parse(content, { logLevel: 'error' }); return true; } catch { return false; }
}
function detect_extension(content) { return is_yaml(content) ? '.yaml' : '.txt'; }
function append_yaml_endline(content) {
  return is_yaml(content) ? content.replace(/(\n)*$/s, '\n') : content;
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeFile(p, content) { ensureDir(path.dirname(p)); fs.writeFileSync(p, content, 'utf8'); }
// node v25 fs.rmSync(recursive:true) on non-ASCII paths crashes; manual walk instead
function safeRm(p) {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) safeRm(path.join(p, name));
    fs.rmdirSync(p);
  } else {
    try { fs.unlinkSync(p); } catch {}
  }
}

const POS_EN = n => ({0:'before_character_definition',1:'after_character_definition',2:'before_author_note',3:'after_author_note',4:'at_depth',5:'before_example_messages',6:'after_example_messages'})[n] ?? 'before_character_definition';
const POS_ZH = {before_character_definition:'色定义之前',after_character_definition:'色定义之后',before_author_note:'作者注释之前',after_author_note:'作者注释之后',at_depth:'定深度',before_example_messages:'示例消息之前',after_example_messages:'例消息之后'};
const ROLE_ZH = {0:'系统',1:'用户',2:'AI助手'};
const STRATEGY_ZH = {constant:'蓝',selective:'绿',vectorized:'向量化'};

function strategyType(e) {
  const ex = e.extensions || {};
  if (ex.vectorized) return 'vectorized';
  if (e.selective) return 'selective';
  if (e.constant) return 'constant';
  return 'constant';
}

// ---- 清理旧拆解产物 (只保留原 JSON) ----
log('cleanup-start');
for (const sub of ['第一条消息','世界书','正则','本']) {
  log('  rm ' + sub);
  safeRm(path.join(ROOT, sub));
  log('    done ' + sub);
}
log('  rm index.yaml');
safeRm(path.join(ROOT, 'index.yaml'));
log('cleanup-done');

// ==== 第一条消息: 只保留 first_mes ====
const 第一条消息 = [];
const firstMes = d.first_mes ?? '';
const fDir = path.join(ROOT, '第一条消息');
log('firstmes-start, lines=' + firstMes.split('\n').length);
if (firstMes !== '' && firstMes.split('\n').length > 3) {
  writeFile(path.join(fDir, '0.txt'), firstMes);
  第一条消息.push({ 文件: '第一条消息/0' });
} else {
  第一条消息.push({ 内容: firstMes });
}
log('firstmes-done');

// ==== 世界书条目 ====
const worldbookDir = path.join(ROOT, '世界书');
const entries = [];
console.error('[stage2.5] start entries loop');
(d.character_book.entries || []).forEach((e, idx) => {
  if (idx % 100 === 0) console.error(`  [entry ${idx}/${(d.character_book.entries||[]).length}] ${e.comment}`);
  const ex = e.extensions || {};
  const name = e.comment;
  const content = e.content ?? '';

  const entry = { 名称: name, 用: !!e.enabled };

  const strat = { 类型: STRATEGY_ZH[strategyType(e)] };
  if ((e.keys || []).length) strat.关键字 = e.keys.slice();
  entry.策略 = strat;

  const posType = POS_EN(ex.position ?? 0);
  const pos = { 类型: POS_ZH[posType],顺序: e.insertion_order };
  if (posType === 'at_depth') {
    pos.角色 = ROLE_ZH[ex.role ?? 0];
    pos.度 = ex.depth ?? 4;
  }
  entry.入位置 = pos;
  entry.率 = ex.probability ?? 100;

  const rec = {};
  rec['不可被其他条目激活'] = !!ex.exclude_recursion;
  rec['不可激活其他条目'] = !!ex.prevent_recursion;
  if (ex.delay_until_recursion) rec['迟递归'] = true;
  entry.递归 = rec;

  const effect = {};
  if (ex.sticky) effect.黏性 = ex.sticky;
  if (ex.cooldown) effect.冷却 = ex.cooldown;
  if (ex.delay) effect.迟 = ex.delay;
  if (Object.keys(effect).length) entry.特殊效果 = effect;

  const grp = String(ex.group ?? '').trim();
  if (grp) {
    const g = { 组标签: grp.split(',').map(s => s.trim()) };
    if (ex.group_override === true) g.使用优先级 = true;
    if ((ex.group_weight ?? 100) !== 100) g.重 = ex.group_weight;
    if (ex.use_group_scoring != null) g.使用评分 = ex.use_group_scoring;
    entry.组 = g;
  }

  if (content !== '' && content.split('\n').length > 3) {
    const safe = sanitize_filename(name);
    writeFile(path.join(worldbookDir, safe + detect_extension(content)), append_yaml_endline(content));
    entry.文件 = `世界书/${safe}`;
  } else {
    entry.内容 = content;
  }
  entries.push(entry);
});

// ==== 正则 ====
const regexDir = path.join(ROOT, '正则');
const 正则 = [];
(ext.regex_scripts || []).forEach((r) => {
  const placement = r.placement || [];
  const rs = r.replaceString ?? '';
  const item = { 正则名称: r.scriptName };
  if (r.id) item.id = r.id;
  item.用 = !r.disabled;
  item.查找表达式 = r.findRegex;
  if ((r.trimStrings || []).length) item.修剪掉 = r.trimStrings;
  if (rs !== '' && rs.split('\n').length > 3) {
    const safe = sanitize_filename(r.scriptName);
    writeFile(path.join(regexDir, safe + '.txt'), rs);
    item.文件 = `正则/${safe}`;
  } else {
    item.内容 = rs;
  }
  const source = {};
  if (placement.includes(2)) source.AI输出 = true;
  if (placement.includes(1)) source.用户输入 = true;
  if (placement.includes(3)) source.快捷命令 = true;
  if (placement.includes(5)) source.世界信息 = true;
  if (Object.keys(source).length) item.来源 = source;
  const dest = { 仅格式显示: !!r.markdownOnly, 仅格式提示词: !!r.promptOnly };
  if (dest.仅格式显示 || dest.仅格式提示词) item.作用于 = dest;
  if (r.runOnEdit) item.在编辑时运行 = true;
  if (r.minDepth != null) item.最小深度 = r.minDepth;
  if (r.maxDepth != null) item.最大深度 = r.maxDepth;
  正则.push(item);
});

// ====馆助手 (tavern_helper) ====
const scriptDir = path.join(ROOT, '脚本');
const 本库 = [];
(ext.tavern_helper?.scripts || []).forEach((s) => {
  const content = s.content ?? '';
  const item = { 名称: s.name };
  if (s.id) item.id = s.id;
  item.用 = !!s.enabled;
  item.类型 = s.type === 'folder' ? '文件夹' : '脚本';
  if (content !== '' && content.split('\n').length > 3) {
    const safe = sanitize_filename(s.name);
    writeFile(path.join(scriptDir, safe + '.js'), content);
    item.文件 = `脚本/${safe}`;
  } else {
    item.内容 = content;
  }
  if (s.info) item.介绍 = s.info;
  if (s.button) {
    const btn = {};
    if (s.button.enabled != null) btn.启用 = s.button.enabled;
    if ((s.button.buttons || []).length) btn.按钮列表 = s.button.buttons.map(b => ({ 名称: b.name,可见: !!b.visible }));
    if (Object.keys(btn).length) item.按钮 = btn;
  }
  if (s.data && Object.keys(s.data).length) item.数据 = s.data;
  if (s.export_with) {
    const ew = {};
    if (s.export_with.data != null) ew.数据 = s.export_with.data;
    if (s.export_with.button != null) ew.按钮 = s.export_with.button;
    if (Object.keys(ew).length) item.导出时携带 = ew;
  }
 本库.push(item);
});

// ==== index.yaml ====
const idx = { 第一条消息: 第一条消息,色描述: d.description ?? '' };
if (d.character_version) idx.版本 = d.character_version;
if (d.creator) idx.作者 = d.creator;
if (d.creator_notes) idx.备注 = d.creator_notes;
if (d.character_book?.name) idx.世界书名称 = d.character_book.name;
idx.条目 = entries;

const _ext = {};
if (正则.length) _ext.正则 = 正则;
if (本库.length) _ext.酒馆助手 = { 本库: 本库 };
if (ext.tavern_helper?.variables && Object.keys(ext.tavern_helper.variables).length) _ext.变量 = ext.tavern_helper.variables;
if (Object.keys(_ext).length) idx.扩展字段 = _ext;

const doc = new YAML.Document();
doc.contents = doc.createNode(idx);
console.error('[stage3] entries=', entries.length, '正则=', 正则.length, '本库=', 本库.length, '; serializing...');
const yamlText = doc.toString({ lineWidth: 0, nullStr: 'null' });
writeFile(path.join(ROOT, 'index.yaml'), yamlText);
console.error('[stage4] done; yaml bytes=', yamlText.length);

console.log('解完成:');
console.log(' 第一条消息:', 第一条消息.length, '条(first_mes)');
console.log(' 世界书:', entries.length, '个条目');
console.log(' 正则:', 正则.length, '个');
console.log('本:', 本库.length, '个');