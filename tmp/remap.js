// Remap 此间天地/index.yaml shortened zh keys/values -> canonical full-form,
// matching tavern_sync's character.zh schema. Preserves formatting via yaml Document AST.
const fs = require('fs');
const { parseDocument, isMap, isSeq, isScalar } = require('yaml');

const path = '角色卡工作室/此间天地/index.yaml';
const text = fs.readFileSync(path, 'utf8');
const doc = parseDocument(text);

const KEYMAP = {
  '用': '启用',
  '策略': '激活策略',
  '入位置': '插入位置',
  '率': '激活概率',
  '度': '深度',
  '色描述': '角色描述',
  '本库': '脚本库',
};
// enum VALUES that appear only under `类型:` keys (strategy / position). `脚本` untouched.
const VALMAP = {
  '绿': '绿灯',
  '蓝': '蓝灯',
  '色定义之前': '角色定义之前',
  '定深度': '指定深度',
};

let renamedKeys = 0, renamedVals = 0;

function visit(node) {
  if (node == null) return;
  if (isSeq(node)) {
    for (const item of node.items) visit(item);
    return;
  }
  if (isMap(node)) {
    for (const pair of node.items) {
      // rename key
      const kn = pair.key;
      if (isScalar(kn) && typeof kn.value === 'string' && KEYMAP[kn.value]) {
        kn.value = KEYMAP[kn.value];
        renamedKeys++;
      }
      const key = isScalar(pair.key) ? pair.key.value : pair.key;
      // remap 类型 enum value (only key named 类型)
      if (key === '类型') {
        const vn = pair.value;
        if (isScalar(vn) && typeof vn.value === 'string' && VALMAP[vn.value]) {
          vn.value = VALMAP[vn.value];
          renamedVals++;
        }
      }
      visit(pair.value);
    }
  }
}
visit(doc.contents);

const header = '# yaml-language-server: $schema=https://testingcf.jsdelivr.net/gh/StageDog/tavern_sync/dist/schema/character.zh.json\n';
let out = doc.toString({ lineWidth: 0 });
if (!out.startsWith('# yaml-language-server')) {
  out = header + out;
}

fs.writeFileSync(path, out, 'utf8');
console.log('renamed keys:', renamedKeys, ' renamed 类型 values:', renamedVals);
console.log('output bytes:', Buffer.byteLength(out, 'utf8'));