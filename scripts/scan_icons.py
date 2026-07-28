import re, os, glob
base = 'c:/cursor/ewai/tavern_helper_template-main/src/前端悬浮球V1'
txt = open(base + '/lib/icons.ts', encoding='utf-8').read()
reg = set()
for m in re.finditer(r'''(?m)^\s*(['"]?)([A-Za-z0-9_-]+)\1\s*:\s*inner\(''', txt):
    reg.add(m.group(2))
used = {}
for f in glob.glob(base + '/**/*.ts', recursive=True):
    nf = f.replace('\\', '/')
    if '/.backup/' in nf:
        continue
    t = open(f, encoding='utf-8').read()
    for m in re.finditer(r'fa-[a-z0-9-]+', t):
        name = m.group(0)[3:]
        used.setdefault(name, set()).add(os.path.basename(f))
missing = sorted(k for k in used if k not in reg)
print('REGISTERED:', len(reg), 'USED:', len(used))
print('=== MISSING ===')
for k in missing:
    print('fa-%-24s <- %s' % (k, ', '.join(sorted(used[k]))))
