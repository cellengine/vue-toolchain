const transform = require('./transform');
const compiler = require('vue-template-compiler'); // just used for logging

let SourceMapConsumer, SourceMapGenerator;

try {
  const sourceMap = require('source-map');
  SourceMapConsumer = sourceMap.SourceMapConsumer;
  SourceMapGenerator = sourceMap.SourceMapGenerator;
} catch (e) {}

function pad(source) {
  return source.split(/\r?\n/).map(line => `  ${line}`).join('\n');
}

module.exports = function (content) {
  const {babel: {code, map}, tips, errors, template} = transform(content, this.resourcePath);
  let finalMap = null;

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

  if (SourceMapConsumer && SourceMapGenerator) {
    const consumer = SourceMapConsumer(map);
    finalMap = SourceMapGenerator.fromSourceMap(consumer);
    finalMap.setSourceContent(this.resourcePath, content);
  }

  this.callback(null, code, finalMap && finalMap.toJSON());
};
