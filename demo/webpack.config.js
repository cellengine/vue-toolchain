module.exports = {
  context: __dirname,
  entry: './index.js',
  output: {
    filename: 'build.js'
  },
  module: {
    rules: [
      {test: /\.vue$/, use: '../loader'}
    ]
  }
};
