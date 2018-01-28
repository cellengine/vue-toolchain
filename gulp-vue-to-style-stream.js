const {Transform} = require('stream');
const {parseComponent} = require('vue-template-compiler');

module.exports = function () {
  return new Transform({
		objectMode: true,
    transform(file, enc, cb) {
			const s = file.contents.toString();
			const scss = parseComponent(s).styles.map(s => s.content).join('\n\n');
			file.contents = Buffer.from(scss);
			cb(null, file);
    }
  });
};
