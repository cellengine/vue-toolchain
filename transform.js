const babel = require('@babel/core');
const compiler = require('@vue/compiler-sfc');

function removeSourceMap(ast) {
  babel.traverse(ast, {
    enter(path) {
      if (path.node.loc) delete path.node.loc;
      delete path.node.start;
      delete path.node.end;
    }
  });
}

const {
  Identifier,
  VariableDeclaration,
  VariableDeclarator,
  ExpressionStatement,
  AssignmentExpression,
  MemberExpression,
  ExportDefaultDeclaration,
  LogicalExpression,
  FunctionDeclaration
} = babel.types;

function getRenderFunctionDeclaration(ast) {
  const expr = ast.program.body[0].declarations[0].init;
  return FunctionDeclaration(Identifier('render'), expr.params, expr.body);
}

function getStaticRenderFunctionExpressions(ast) {
  return ast.program.body[1].declarations[0].init;
}

const getPlugin = (renderFunctionDeclr, staticRenderArrayExpr, isFunctional) => {
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

          if (renderFunctionDeclr) {
            statements.splice(1, 0, ExpressionStatement(
              AssignmentExpression('=',
                MemberExpression(Identifier('__export__'), Identifier('render')),
                LogicalExpression('||',
                  MemberExpression(Identifier('__export__'), Identifier('render')),
                  Identifier('render')
                )
              )
            ));
            statements.splice(1, 0, renderFunctionDeclr);
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
        }
      }
    };
  }
};

module.exports = async function (vueSource, vueFilename, extraPlugins) {
  vueFilename = vueFilename.replace(/\\/g, "/");
  const plugins = extraPlugins || [];
  const sfc = compiler.parse({source: vueSource, filename: vueFilename});
  const script = sfc.script || sfc.scriptSetup ? compiler.compileScript(sfc) : null;
  const whitespace = sfc.template ? (sfc.template.attrs && sfc.template.attrs.condense ? 'condense' : 'preserve') : null;
  const template = sfc.template ? compiler.compileTemplate({
    bindings: script && script.bindings,
    source: sfc.template.content,
    isFunctional: sfc.template ? sfc.template.attrs.functional : false,
    isProduction: true, // just disables prettifying render functions as of 2.2.0
    compilerOptions: {outputSourceRange: true, whitespace},
    transpileOptions: {transforms: {spreadRest: false}}
  }) : null;

  let renderFunctionDeclr, staticRenderArrayExpr;

  if (template) {
    const ast = babel.parse(template.code);
    removeSourceMap(ast);
    renderFunctionDeclr = getRenderFunctionDeclaration(ast);
    staticRenderArrayExpr = getStaticRenderFunctionExpressions(ast);
  }
  plugins.unshift(getPlugin(renderFunctionDeclr, staticRenderArrayExpr, sfc.template && sfc.template.attrs.functional));

  if (script && script.lang === 'ts') {
    plugins.unshift(require('@babel/plugin-transform-typescript').default);
  }

  const generated = babel.transformSync(script ? script.content : 'export default {};', {
    plugins,
    inputSourceMap: script.map,
    sourceFileName: vueFilename,
    sourceMaps: true
  });

  return {
    code: generated.code,
    map: generated.map,
    tips: template && template.tips || [],
    errors: template && template.errors || [],
    template
  };
};
