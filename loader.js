const transform = require("./transform");

module.exports = function (content) {
  const {code, map} = transform(content, this.resourcePath);
  this.callback(null, code, map);
};
