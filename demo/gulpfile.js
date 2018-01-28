const gulp = require('gulp');
const concat = require('gulp-concat');
const streamqueue = require('streamqueue');
const scss = require('gulp-sass');

// In your project, use require('vue-toolchain/gulp-vue-to-style-stream')
const vueToStyle = require('../gulp-vue-to-style-stream');

gulp.task("styles", () => {
  return streamqueue(
    {objectMode: true},
    gulp.src('variables.scss'),
    gulp.src('main.scss'),
    gulp.src('*.vue').pipe(vueToStyle())
  )
    .pipe(concat("style.scss"))
    .pipe(scss())
    .pipe(gulp.dest('.'));
});
  
