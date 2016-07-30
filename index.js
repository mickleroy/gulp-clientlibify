'use strict';

var path    = require('path');
var gutil   = require('gulp-util');
var through = require('through2');
var assign  = require('object-assign');
var chalk   = require('chalk');
var plur    = require('plur');
var fs      = require('fs');

// grab the location from where the script is running from
// i.e. ~/projects/myproj/node_modules/grunt-clientlibify/tasks/
var taskDir     = __dirname;
var PLUGIN_NAME = "gulp-clientlibify";

module.exports = function (options) {

	options = assign({
      dest: 'tmp',
      assetsDirs: [],
      installPackage: false,
      categories: ['etc-clientlibify'],
      embed: [],
      dependencies: [],
      packageName: 'clientlibify',
      packageVersion: '1.0',
      packageGroup: 'my_packages',
      packageDescription: 'CRX package installed using the grunt-clientlibify plugin',
      deployScheme: 'http',
      deployHost: 'localhost',
      deployPort: '4502',
      deployUsername: 'admin',
      deployPassword: 'admin'
    }, options);

    // set the main category as the first categories entry
    options.category = options.categories[0];

	// validate mandatory config
    if(!options.cssDir && !options.jsDir) {
		throw new gutil.PluginError(PLUGIN_NAME, '`cssDir` and/or `jsDir` must be provided');
    }

    if (options.cssDir && !fs.lstatSync(options.cssDir).isDirectory()) {
      	throw new gutil.PluginError(PLUGIN_NAME, options.cssDir + ' is not a directory');
    }

    if (options.jsDir && !fs.lstatSync(options.jsDir).isDirectory()) {
      	throw new gutil.PluginError(PLUGIN_NAME, options.jsDir + ' is not a directory');
    }

	var fileCount = 0;
	var cssFiles = [];
	var jsFiles = [];
	var cssPath = fs.realpathSync(options.cssDir);
	var jsPath = fs.realpathSync(options.jsDir);

	function bufferContents(file, encoding, callback) {
		if (file.isNull()) {
			callback(null, file);
			return;
		}

		if (file.isStream()) {
			this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Streaming not supported'));
			callback();
			return;
		}

		//TODO: add file to array
		//TODO: add file entry to txt file

		if(cssPath && path.extname(file.relative) == '.css' && isFileInPath(file, cssPath)) {
			cssFiles.push(file);
			gutil.log(PLUGIN_NAME, chalk.green('✔ ') + file.relative);
			fileCount++;
		} else {
			gutil.log(PLUGIN_NAME, chalk.red('x ') + file.relative);
		}

		
		callback(null, file);
	}

	function endStream(callback) {
		//TODO: build package
		//TODO: upload package
		gutil.log(cssFiles, ' CSS files added');
		fileUploaded = true;

		if (fileUploaded) {
			gutil.log(PLUGIN_NAME, gutil.colors.green('CRX Package uploaded successfully'));
		} else {
			gutil.log(PLUGIN_NAME, gutil.colors.yellow('No files uploaded'));
		}

		//TODO: pass zip file through
		// this.push(zipFile);
		callback();
	}

	function isFileInPath(file, path) {
		gutil.log(file.contents);
		gutil.log('Checking ', file.relative, ' is in ', path);
		return fs.realpathSync(file.relative).indexOf(path) == 0;
	}

	return through.obj(bufferContents, endStream);
};
