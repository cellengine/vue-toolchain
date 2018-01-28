const transform = require('./transform');
let SourceMapConsumer, SourceMapGenerator;

try {
  const sourceMap = require('source-map');
  SourceMapConsumer = sourceMap.SourceMapConsumer;
  SourceMapGenerator = sourceMap.SourceMapGenerator;
} catch (e) {}

module.exports = function (content) {
  const {code, map} = transform(content, this.resourcePath);
  let finalMap = null;

  if (SourceMapConsumer && SourceMapGenerator) {
    const consumer = SourceMapConsumer(map);
    finalMap = SourceMapGenerator.fromSourceMap(consumer);
    finalMap.setSourceContent(this.resourcePath, content);
  }

  this.callback(null, code, finalMap && finalMap.toJSON());
};
