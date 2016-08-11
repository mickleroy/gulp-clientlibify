'use strict';

var gulp         = require('gulp');
var del          = require('del');
var sass         = require('gulp-ruby-sass');
var gutil        = require('gulp-util');
var concat       = require('gulp-concat');
var clientlibify = require('gulp-clientlibify');

gulp.task('clean', function() {
  	return del(['dist/scripts', 'dist/styles', 'dist/images', 'dist/*.zip']);
});

gulp.task('scripts', function() {
  return gulp.src('assets/scripts/**/*.js')
    .pipe(concat('concat.js'))
    .pipe(gulp.dest('dist/scripts'));
});

gulp.task('styles', function() {
	return sass('assets/styles/base.scss')
		.pipe(gulp.dest('dist/styles'));
});

gulp.task('images', function() {
	return gulp.src('assets/images/**/*')
		.pipe(gutil.noop())
		.pipe(gulp.dest('dist/images'));
})

gulp.task('clientlibify', ['scripts', 'styles', 'images'], function() {
	return gulp.src('dist/**/*')
		.pipe(clientlibify({
			dest: 'dist',
	        cssDir: 'dist/styles',
	        jsDir: 'dist/scripts',
	        assetsDirs: ['dist/images'],

	        // set `installPackage` to `true` to deploy to an AEM instance
	        installPackage: false,

	        categories: ['awesome-styleguide'],
	        embed: [],
	        dependencies: ['cq-jquery'],

	        // package options
	        packageName: 'prickly-pear',
	        packageVersion: '2.1',
	        packageGroup: 'My Company',
	        packageDescription: 'CRX package installed using the gulp-clientlibify plugin',

	        // deploy options
	        // Note: these options would likely come from environment vars
	        deployScheme: 'http',
	        deployHost: 'localhost',
	        deployPort: '4502',
	        deployUsername: 'admin',
	        deployPassword: 'admin'
	    }))
	    .pipe(gulp.dest('dist'))
});

gulp.task('default', ['clean', 'clientlibify']);
