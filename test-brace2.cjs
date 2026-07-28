const ts = require('typescript');
const fs = require('fs');

const content = fs.readFileSync('src/0615悬浮球/status-bar-init.ts', 'utf8');
const sourceFile = ts.createSourceFile('test.ts', content, ts.ScriptTarget.Latest, true);

let lastTryEnd = -1;
let lastTryLine = -1;

function visit(node) {
  if (ts.isTryStatement(node)) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const hasCatch = node.catchClause ? 'CATCH' : '';
    const hasFinally = node.finallyBlock ? 'FINALLY' : '';
    if (!hasCatch && !hasFinally) {
      console.log('TRY WITHOUT CATCH/FINALLY line', start, 'end', end);
    }
    if (end > lastTryEnd) {
      lastTryEnd = end;
      lastTryLine = start;
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);
console.log('Last try starts at line', lastTryLine, 'ends at line', lastTryEnd);
console.log('File has', sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1, 'lines');
