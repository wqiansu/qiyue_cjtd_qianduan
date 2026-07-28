const ts = require('typescript');
const fs = require('fs');

const content = fs.readFileSync('src/0615悬浮球/status-bar-init.ts', 'utf8');
const sourceFile = ts.createSourceFile('test.ts', content, ts.ScriptTarget.Latest, true);

let lastTryEnd = -1;

function visit(node) {
  if (ts.isTryStatement(node)) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    if (!node.catchClause && !node.finallyBlock) {
      console.log('TRY WITHOUT CATCH line', start, 'end', end);
    }
    lastTryEnd = end;
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);
console.log('Last try ends at line', lastTryEnd);
console.log('File has', sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1, 'lines');
