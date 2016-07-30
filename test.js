'use strict';

var clientlibify = require('./');
var assert       = require('stream-assert');
var fs           = require('fs');
var gutil        = require('gulp-util');
var pathExists   = require('path-exists');
var gulp         = require('gulp');
var path         = require('path');
var should 		 = require('should');

describe('gulp-clientlibify', function() {
	before(function () {
		gutil.log('gulp-clientlibify:', 'started running test');
	});

	after(function () {
		gutil.log('gulp-clientlibify:', 'finished running test');
	});

  	it('should throw error when `cssDir` and `jsDir` options are missing', function () {
        (function() {
          clientlibify({ 
          	cssDir: undefined,
          	jsDir: undefined
          });
        }).should.throw('`cssDir` and/or `jsDir` must be provided');
	});

  	it('should throw error when `cssDir` is not a directory', function () {
        (function() {
          clientlibify({ 
          	cssDir: 'fixtures/css/test.css'
          });
        }).should.throw('fixtures/css/test.css is not a directory');
	});

  	it('should throw error when `jsDir` is not a directory', function () {
        (function() {
          clientlibify({ 
          	cssDir: 'fixtures/js/test.js'
          });
        }).should.throw('fixtures/js/test.js is not a directory');
	});

	it('should emit error on streamed file', function (done) {
		gulp.src('fixtures/**/*', { buffer: false })
		  .pipe(clientlibify({
		  	cssDir: 'fixtures/css',
		  	jsDir: 'fixtures/js'
		  }))
    	  .on('error', function (err) {
      		err.message.should.eql('Streaming not supported');
      		done();
		  });
	});

    it('should process all files', function (done) {
      gulp.src('fixtures/**/*')
        .pipe(clientlibify({
		  	cssDir: 'fixtures/css',
		  	jsDir: 'fixtures/js'
		}))
        .pipe(assert.length(15))
        .pipe(assert.end(done));
	});
});