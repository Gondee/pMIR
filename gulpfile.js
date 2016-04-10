/// <binding BeforeBuild='default' />
var gulp = require('gulp');
var gutil = require('gulp-util');
var concat = require('gulp-concat');
var minifyCss = require('gulp-minify-css');
var rename = require('gulp-rename');
var sh = require('shelljs');
var browserify = require('browserify');
var vinylSource = require('vinyl-source-stream');

var paths = {
  sass: ['./scss/**/*.scss']
};

gulp.task('default', ['browserify']);

gulp.task('browserify', function () {
    return browserify('./WWW/js/nodeServices.js', { debug: true })
     .bundle()
     .pipe(vinylSource('nodeBundle.js'))
     .pipe(gulp.dest('./WWW/dist'));
});

