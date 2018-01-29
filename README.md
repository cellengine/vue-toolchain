# vue-toolchain

This is a small suite of tools for bundling and testing a Vue project. Its main advantages over [vue-loader](https://github.com/vuejs/vue-loader) and others is:

* Ability to load and test `.vue` files in Node
* A [Webpack](https://github.com/webpack/webpack) loader that produces less output, and
* A [Gulp](https://github.com/gulpjs/gulp) utility for integrating `<style>` into your Gulp pipeline.

## `vue-toolchain/register`

[Example](https://github.com/primitybio/vue-toolchain/blob/master/package.json#L9) <sub>(change `register.js` to `vue-toolchain/register`)</sub>

You can use this with [Mocha](https://github.com/mochajs/mocha) to launch tests that require Vue files. Say you have some tests, `Button.spec.js` for `Button.vue`. Assume `Button.spec.js` looks like this:

```javascript
const Button = require('./Button.vue').default;
const Vue = require('vue');
const vm = new Vue(Button);

vm.text = 'Click Me!';
vm.$mount();

expect(vm._vnode.children[0].text).toBe('Click me!')
```

You can use `vue-toolchain` to run the tests in Node like this:

```sh
$ mocha -r vue-toolchain/register Button.spec.js
```

## `vue-toolchain/loader`

[Example](https://github.com/primitybio/vue-toolchain/blob/master/demo/webpack.config.js)

Use the loader like any Webpack loader. Sourcemaps are supported, but many of the `vue-loader` features like HMR are not yet supported. Stripping out CSS is specifically not supported because of a preference to use Gulp for styles (more on that below).

```javascript
module.exports = {
  module: {
    rules: [
      {test: /\.vue$/, use: 'vue-toolchain/loader'}
    ]
  }
};
```

One benefit of using `vue-toolchain`'s loader is that unlike the upstream `vue-loader`, it does not use a combination of 3 Webpack loaders and 3 JS modules for one component. `vue-toolchain`'s loader uses an alternate approach: using [Babel](https://github.com/babel/babel), modify the AST of the component to add the render function. In large applications, this can save you tens of kilobytes.

## `vue-toolchain/gulp-vue-to-style-stream`

[Example](https://github.com/primitybio/vue-toolchain/blob/master/demo/gulpfile.js#L14)

You can pipe the `.vue` files through this Gulp util in order to get styles out. Doing it this way allows you to have variables defined in other SCSS files which you can then use in your component `<style>`. (If you do want to use variables, just make sure they concatenate in the right order - see the demo for how).

```javascript
const gulp = require('gulp');
const vueToStyle = require('../gulp-vue-to-style-stream');
const scss = require('gulp-sass');
const concat = require('gulp-concat');

gulp.task('scss', () => {
  gulp.src('*.vue')
    .pipe(vueToStyle())
    .pipe(concat('styles.scss'))
    .pipe(scss())
    .pipe(gulp.dest('.'));
});
```
