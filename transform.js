const babel = require('babel-core');
const generate = require('babel-generator').default;
const Compiler = require('vue-template-compiler');
const transpile = require('vue-template-es2015-compiler');

// Requiring it directly avoids babel/babel#3969
const ExportDefaultPlugin = require('babel-plugin-transform-es2015-modules-commonjs');

function functionDeclarationToExpression(declaration) {
  if (declaration.type === 'FunctionDeclaration') {
    declaration.type = 'FunctionExpression';
  }
  return declaration;
}

function functionSourceToExpression(src) {
  const ast = babel.transform(src).ast;
  
  babel.traverse(ast, {
    enter(path) {
      if (path.node.loc) delete path.node.loc;
      delete path.node.start;
      delete path.node.end;
    }
  });

  return functionDeclarationToExpression(ast.program.body[0]);
}

const {
  ObjectProperty,
  Identifier,
  VariableDeclaration,
  VariableDeclarator,
  ExpressionStatement,
  AssignmentExpression,
  MemberExpression,
  ExportDefaultDeclaration
} = babel.types;

const getPlugin = renderFunctionExpression => {
  return function AddFunctionPlugin() {
    return {
      visitor: {
        ExportDefaultDeclaration(path) {
          const body = path.parent.body;
          const expression = functionDeclarationToExpression(path.node.declaration);
          const modifiedExport = VariableDeclaration('const',
            [VariableDeclarator(Identifier('__export__'), expression)]
          );

          body.splice(body.indexOf(path.node), 1,
            modifiedExport,
            ExpressionStatement(
              AssignmentExpression('=',
                MemberExpression(Identifier('__export__'), Identifier('render')),
                renderFunctionExpression
              )
            ),
            ExportDefaultDeclaration(Identifier('__export__'))
          );

          path.stop();
        }
      }
    };
  }
};

function getLineNumbers(blocks, vueSource) {
  const lines = [0];
  let last = 0;
  vueSource.split(/\r?\n/g).forEach(line => {
    last += line.length;
    lines.push(last - 1);
  });
}

module.exports = function (vueSource, vueFilename, extraPlugins) {
  const plugins = [ExportDefaultPlugin].concat(extraPlugins || []);
  const {script, template} = Compiler.parseComponent(vueSource, {pad: 'line'});
  const c = template && Compiler.compile(template ? template.content : '');

  if (c) {
    const renderSource = transpile(`
      function render(_h, _vm) {
        ${c.render}
      }
    `);
    const renderFunctionExpression = functionSourceToExpression(renderSource);
    plugins.unshift(getPlugin(renderFunctionExpression));
  }

  const ast = babel.transform(script ? script.content : '', {plugins}).ast;

  return generate(ast, {sourceMaps: true, filename: vueFilename, sourceFileName: vueFilename, sourceMapTarget: vueFilename});
};
