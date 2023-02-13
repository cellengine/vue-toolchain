const transform = require('./transform');
const compiler = require('@vue/compiler-sfc');

function pad(source) {
  return source.split(/\r?\n/).map(line => `  ${line}`).join('\n');
}

module.exports = function (content) {
  const callback = this.async();
  transform(content, this.resourcePath).then(({code, map, tips, errors, template}) => {
    for (const tip of tips || []) {
      this.emitWarning(typeof tip === 'object' ? tip.msg : tip);
    }

    if (errors && errors.length) {
      this.emitError(
        '\n\n  Errors compiling template:\n\n' +
        errors.map(({msg, start, end}) => {
          const frame = compiler.generateCodeFrame(template.content, start, end)
          return `  ${msg}\n\n${pad(frame)}`
        }).join('\n\n') +
        '\n'
      );
    }

    callback(null, code, map);
  });
};
