const transform = require('./transform');
const jsHook = require.extensions['.js'];

// TODO allow register to be called externally somehow?
// in CellEngine we need to pass @primitybio/vue-template-compiler,
// but not a problem right now since we don't use this in CE
transform.register(require("vue-template-compiler"));

require.extensions['.vue'] = function (module, file) {
  const oldCompile = module._compile;
  module._compile = function (code, file) {
    code = transform(code).babel.code;
    module._compile = oldCompile;
    module._compile(code, file);
  };
  jsHook(module, file);
};
