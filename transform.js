const babel = require('@babel/core');
const generate = require('@babel/generator').default;
const cutils = require('@vue/component-compiler-utils');

function removeSourceMap(ast) {
  babel.traverse(ast, {
    enter(path) {
      if (path.node.loc) delete path.node.loc;
      delete path.node.start;
      delete path.node.end;
    }
  });
}

function getRenderFunctionExpression(ast) {
  return ast.program.body[0].declarations[0].init;
}

function getStaticRenderFunctionExpressions(ast) {
  return ast.program.body[1].declarations[0].init;
}

const {
  ArrayExpression,
  ObjectProperty,
  Identifier,
  VariableDeclaration,
  VariableDeclarator,
  ExpressionStatement,
  AssignmentExpression,
  MemberExpression,
  ExportDefaultDeclaration
} = babel.types;

const getPlugin = (renderFunctionExpr, staticRenderArrayExpr, isFunctional) => {
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

          if (renderFunctionExpr) {
            statements.splice(1, 0, ExpressionStatement(
              AssignmentExpression('=',
                MemberExpression(Identifier('__export__'), Identifier('render')),
                renderFunctionExpr
              )
            ));
          }

          if (staticRenderArrayExpr) {
            statements.splice(1, 0, ExpressionStatement(
              AssignmentExpression('=',
                MemberExpression(Identifier('__export__'), Identifier('staticRenderFns')),
                staticRenderArrayExpr
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
  const compiler = module.exports.compiler || require("vue-template-compiler");
  const plugins = extraPlugins || [];

  const {script, template} = cutils.parse({
    source: vueSource,
    compiler,
    needMap: false
  });

  const {code, tips, errors} = template ? cutils.compileTemplate({
    source: template.content,
    compiler,
    isFunctional: template && template.attrs.functional,
    isProduction: true, // just disables prettifying render functions as of 2.2.0
    compilerOptions: {outputSourceRange: true}
  }) : {};

  let renderFunctionExpr, staticRenderArrayExpr;

  if (code) {
    const ast = babel.parse(code);
    removeSourceMap(ast);
    renderFunctionExpr = getRenderFunctionExpression(ast);
    staticRenderArrayExpr = getStaticRenderFunctionExpressions(ast);
  }

  plugins.unshift(getPlugin(renderFunctionExpr, staticRenderArrayExpr, template && template.attrs.functional));

  const ast = babel.transformSync(script ? script.content : 'export default {};', {plugins, ast: true}).ast;

  return {
    babel: generate(ast, {sourceMaps: true, filename: vueFilename, sourceFileName: vueFilename, sourceMapTarget: vueFilename}),
    tips,
    errors,
    template
  };
};

module.exports.registerCompiler = c => module.exports.compiler = c;
