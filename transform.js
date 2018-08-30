const babel = require('babel-core');
const generate = require('babel-generator').default;
const compiler = require('vue-template-compiler');
const cutils = require('@vue/component-compiler-utils');

// Requiring it directly avoids babel/babel#3969
const ExportDefaultPlugin = require('babel-plugin-transform-es2015-modules-commonjs');

function getRenderFunctionExpression(src) {
  const ast = babel.transform(src).ast;
  
  babel.traverse(ast, {
    enter(path) {
      if (path.node.loc) delete path.node.loc;
      delete path.node.start;
      delete path.node.end;
    }
  });

  return ast.program.body[0].declarations[0].init;
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

const getPlugin = (renderFunctionExpression, isFunctional) => {
  return function AddFunctionPlugin() {
    return {
      visitor: {
        ExportDefaultDeclaration(path) {
          const body = path.parent.body;
          const expression = path.node.declaration;

          const statements = [
            VariableDeclaration('const',
              [VariableDeclarator(Identifier('__export__'), expression)]
            ),
            ExportDefaultDeclaration(Identifier('__export__'))
          ];

          if (renderFunctionExpression) {
            statements.splice(1, 0, ExpressionStatement(
              AssignmentExpression('=',
                MemberExpression(Identifier('__export__'), Identifier('render')),
                renderFunctionExpression
              )
            ));
          }

          if (isFunctional) {
            statements.splice(1, 0, ExpressionStatement(
              AssignmentExpression('=',
                MemberExpression(Identifier('__export__'), Identifier('functional')),
                Identifier('true')
              )
            ));
          }

          const args = [body.indexOf(path.node), 1].concat(statements);
          body.splice.apply(body, args);

          path.stop();
        }
      }
    };
  }
};

module.exports = function (vueSource, vueFilename, extraPlugins) {
  const plugins = [ExportDefaultPlugin].concat(extraPlugins || []);

  const {script, template} = cutils.parse({
    source: vueSource,
    compiler,
    needMap: false
  });

  const {code} = template ? cutils.compileTemplate({
    source: template.content,
    compiler,
    isFunctional: template && template.attrs.functional
  }) : {};

  const renderFunctionExpression = code && getRenderFunctionExpression(code);
  plugins.unshift(getPlugin(renderFunctionExpression, template && template.attrs.functional));

  const ast = babel.transform(script ? script.content : 'export default {};', {plugins}).ast;

  return generate(ast, {sourceMaps: true, filename: vueFilename, sourceFileName: vueFilename, sourceMapTarget: vueFilename});
};
