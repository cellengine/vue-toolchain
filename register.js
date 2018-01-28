const transform = require('./transform');
const jsHook = require.extensions['.js'];

require.extensions['.vue'] = function (module, file) {
  const oldCompile = module._compile;
  module._compile = function (code, file) {
    code = transform(code).code;
    module._compile = oldCompile;
    module._compile(code, file);
  };
  jsHook(module, file);
};
