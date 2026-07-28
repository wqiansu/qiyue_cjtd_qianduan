const ts = require('typescript');
const fs = require('fs');

const content = fs.readFileSync('src/0615悬浮球/status-bar-init.ts', 'utf8');
const sourceFile = ts.createSourceFile('test.ts', content, ts.ScriptTarget.Latest, true);

function visit(node, depth = 0) {
  if (ts.isTryStatement(node) || ts.isFunctionDeclaration(node) || ts.isBlock(node)) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const kind = ts.SyntaxKind[node.kind];
    const hasCatch = node.catchClause ? ' [CATCH]' : '';
    const hasFinally = node.finallyBlock ? ' [FINALLY]' : '';
    if (end >= 3140 && start <= 3157) {
      console.log(' '.repeat(depth), kind, 'line', start, 'end', end, hasCatch, hasFinally);
    }
  }
  ts.forEachChild(node, n => visit(n, depth + 1));
}

visit(sourceFile);
