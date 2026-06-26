// The exported file is JSON (avatar null => JSON export). Compare directly.
const fs = require('fs');
const bundled = JSON.parse(fs.readFileSync('角色卡工作室/导出/此间天地.png', 'utf8'));
const orig = JSON.parse(fs.readFileSync('角色卡工作室/此间天地/此间天地.json', 'utf8'));
const od = orig.data, bd = bundled.data;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('=== CARD-LEVEL ===');
console.log('name           ', eq(bundled.name, orig.name), JSON.stringify(bundled.name));
console.log('description    ', eq(bd.description, od.description), '(b '+(bd.description||'').length+' vs o '+(od.description||'').length+')');
console.log('first_mes      ', eq(bd.first_mes, od.first_mes), '(b '+(bd.first_mes||'').length+' vs o '+(od.first_mes||'').length+')');
console.log('alt_greetings  ', 'b='+bd.alternate_greetings.length+' o='+od.alternate_greetings.length);
console.log('creator_notes  ', eq(bd.creator_notes, od.creator_notes));
console.log('creator        ', eq(bd.creator, od.creator));
console.log('character_version', eq(bd.character_version, od.character_version), JSON.stringify(bd.character_version));
console.log('system_prompt  ', eq(bd.system_prompt, od.system_prompt));
console.log('post_history   ', eq(bd.post_history_instructions, od.post_history_instructions));

console.log('\n=== WORLD BOOK ===');
console.log('entries count  ', 'b='+bd.character_book.entries.length+' o='+od.character_book.entries.length);
console.log('worldbook name ', eq(bd.character_book.name, od.character_book.name), JSON.stringify(bd.character_book.name));

const be = bd.character_book.entries, oe = od.character_book.entries;
const byName = (arr) => { const m = new Map(); arr.forEach(e => { const k = e.comment; if(!m.has(k)) m.set(k, []); m.get(k).push(e); }); return m; };
const bm = byName(be), om = byName(oe);
const allNames = new Set([...bm.keys(), ...om.keys()]);
let mismatch = 0; const details = [];
for (const name of allNames) {
  const bArr = bm.get(name), oArr = om.get(name);
  if (!bArr) { mismatch++; details.push('B_MISSING: '+name); continue; }
  if (!oArr) { mismatch++; details.push('B_EXTRA: '+name); continue; }
  if (bArr.length !== oArr.length) { mismatch++; details.push('COUNT:'+name+' b='+bArr.length+' o='+oArr.length); continue; }
  for (let k = 0; k < bArr.length; k++) {
    const b = bArr[k], o = oArr[k];
    if (!eq(b.content, o.content)) { mismatch++; details.push('CONTENT:'+name+' (b'+(b.content||'').length+' vs o'+(o.content||'').length+')'); }
    for (const f of ['disable','constant','selective','selectiveLogic','vectorized','position','role','depth','order','useProbability','probability','excludeRecursion','preventRecursion','delayUntilRecursion','sticky','cooldown','delay','keys','keysecondary','scanDepth']) {
      if (!eq(b[f], o[f])) { mismatch++; details.push(`FIELD:${name}.${f}: b=`+JSON.stringify(b[f])+' o='+JSON.stringify(o[f])); }
    }
  }
}
console.log('entry mismatches', mismatch);
details.slice(0,30).forEach(d=>console.log('  ', d));
if (details.length>30) console.log('  ... and '+(details.length-30)+' more');

console.log('\n=== REGEX ===');
const brs = bd.extensions.regex_scripts||[], ors = od.extensions.regex_scripts||[];
console.log('regex count ', 'b='+brs.length+' o='+ors.length);
const sortBy = (a,b)=> (a.scriptName||'').localeCompare(b.scriptName||'');
const rb=[...brs].sort(sortBy), ro=[...ors].sort(sortBy);
let rMis=0; const rD=[];
for (let i=0;i<Math.max(rb.length,ro.length);i++){
  if(!rb[i]||!ro[i]){rMis++;rD.push('missing@'+i);continue;}
  if(rb[i].scriptName!==ro[i].scriptName){rMis++;rD.push('name@'+i);continue;}
  for(const f of ['findRegex','replaceString','disabled','markdownOnly','promptOnly','runOnEdit','minDepth','maxDepth']){
    if(!eq(rb[i][f],ro[i][f])){rMis++;rD.push(`${rb[i].scriptName}.${f}`);}
  }
  if(!eq([...(rb[i].placement||[])].sort(),[...(ro[i].placement||[])].sort())){rMis++;rD.push(rb[i].scriptName+'.placement');}
}
console.log('regex mismatches', rMis); rD.forEach(d=>console.log('  ',d));

console.log('\n=== TAVERN_HELPER SCRIPTS ===');
const bs = (bd.extensions.tavern_helper?.scripts||[]).map(s=>({name:s.name,type:s.type,disabled:s.disabled,hasContent:!!(s.content),hasFile:!!(s.file)}));
const oss = (od.extensions.tavern_helper?.scripts||[]).map(s=>({name:s.name,type:s.type,disabled:s.disabled,hasContent:!!(s.content),hasFile:!!(s.file)}));
console.log('b scripts:', JSON.stringify(bs));
console.log('o scripts:', JSON.stringify(oss));
// compare each script content
const bsm=new Map(bs.map((s,i)=>[s.name,brs.find(x=>x.name===s.name)||bd.extensions.tavern_helper.scripts[i]]));
// th scripts access
const bth = bd.extensions.tavern_helper?.scripts||[];
const oth = od.extensions.tavern_helper?.scripts||[];
console.log('--- per-script diff ---');
const names=[...new Set([...bth.map(s=>s.name),...oth.map(s=>s.name)])];
for(const n of names){
  const b=bth.find(s=>s.name===n), o=oth.find(s=>s.name===n);
  if(!b){console.log(n,'B_MISSING');continue;}
  if(!o){console.log(n,'B_EXTRA');continue;}
  const fields=['id','disabled','type'];
  let same=true;
  for(const f of fields){ if(!eq(b[f],o[f])){console.log(n,f,'b='+JSON.stringify(b[f])+' o='+JSON.stringify(o[f]));same=false;} }
  if(!eq(b.content,o.content)) {console.log(n,'content b'+(b.content||'').length+' vs o'+(o.content||'').length); same=false;}
  if(!eq(b.file,o.file)){console.log(n,'file b='+JSON.stringify(b.file)+' o='+JSON.stringify(o.file));same=false;}
  if(same) console.log(n,'OK');
}