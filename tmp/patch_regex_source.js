// Patch regex 来源 blocks in index.yaml: ensure 用户输入 + AI输出 booleans present.
// Faithful to original 此间天地.json placement flags.
const fs = require('fs');
const { parseDocument, isMap, isSeq, isScalar, Pair } = require('yaml');

const path = '角色卡工作室/此间天地/index.yaml';
const doc = parseDocument(fs.readFileSync(path, 'utf8'));

// ground truth from JSON placement: 1=user_input 2=ai_output
const src = JSON.parse(fs.readFileSync('角色卡工作室/此间天地/此间天地.json', 'utf8'));
const rs = src.data.extensions.regex_scripts;
const truth = rs.map(r => {
  const p = r.placement || [];
  return { 用户输入: p.includes(1), AI输出: p.includes(2) };
});

const ext = doc.getIn(['扩展字段', '正则']);
let patched = 0;
if (isSeq(ext)) {
  ext.items.forEach((node, i) => {
    if (!isMap(node)) return;
    const srcNode = node.get('来源');
    if (!isMap(srcNode)) return;
    const t = truth[i];
    // rebuild 来源 map with canonical order: 用户输入 then AI输出 (match schema + example)
    const newPairs = [];
    newPairs.push(new Pair('用户输入', t.用户输入));
    newPairs.push(new Pair('AI输出', t.AI输出));
    // preserve any extra (快捷命令/世界信息) that were already present & true
    srcNode.items.forEach(pair => {
      const k = pair.key.value;
      if (k === '用户输入' || k === 'AI输出') return;
      if (isScalar(pair.value) && pair.value.value === true) newPairs.push(pair);
    });
    srcNode.items = newPairs;
    patched++;
  });
}

let out = doc.toString({ lineWidth: 0 });
// keep header if present
fs.writeFileSync(path, out, 'utf8');
console.log('patched regex 来源 blocks:', patched);