/*
 * gulp-clientlibify
 * https://github.com/mickleroy/gulp-clientlibify
 *
 * Copyright (c) 2016 Michael Leroy
 * Licensed under the MIT license.
 */

'use strict';

var path     = require('path');
var gutil    = require('gulp-util');
var through  = require('through2');
var assign   = require('object-assign');
var fs       = require('fs-extra');
var tmp      = require('tmp');
var _        = require('underscore');
var archiver = require('archiver');
var uri      = require('urijs');
var request  = require('request');

// grab the location from where the script is running from
// i.e. ~/projects/myproj/node_modules/gulp-clientlibify/
var taskDir     = __dirname;
var PLUGIN_NAME = "gulp-clientlibify";

var templates = {
	designContent:    taskDir + '/templates/designContent.xml',
	clientlibContent: taskDir + '/templates/clientlibContent.xml',
	filterXml:        taskDir + '/templates/filter.xml',
	folderContent:    taskDir + '/templates/folderContent.xml',
	jcrRootContent:   taskDir + '/templates/jcrRootContent.xml',
	propertiesXml:    taskDir + '/templates/properties.xml'
}

module.exports = function (options) {

	options = assign({
      dest: 'dist',
      assetsDirs: [],
      installPackage: false,
      categories: ['etc-clientlibify'],
      embed: [],
      dependencies: [],
      packageName: 'clientlibify',
      packageVersion: '1.0',
      packageGroup: 'my_packages',
      packageDescription: 'CRX package installed using the gulp-clientlibify plugin',
      deployScheme: 'http',
      deployHost: 'localhost',
      deployPort: '4502',
      deployUsername: 'admin',
      deployPassword: 'admin'
    }, options);

    // set the main category as the first categories entry
    options.category = options.categories[0];

    // grab an ISO format date
    options.isoDateTime = new Date().toISOString();

	// validate mandatory config
    if(!options.cssDir && !options.jsDir) {
		throw new gutil.PluginError(PLUGIN_NAME, '`cssDir` and/or `jsDir` must be provided');
    }

    if(options.cssDir && !fs.lstatSync(options.cssDir).isDirectory()) {
      	throw new gutil.PluginError(PLUGIN_NAME, options.cssDir + ' is not a directory');
    }

    if(options.jsDir && !fs.lstatSync(options.jsDir).isDirectory()) {
 		throw new gutil.PluginError(PLUGIN_NAME, options.jsDir + ' is not a directory');
    }

	var cssFiles = [];
	var jsFiles = [];
	var cssPath = options.cssDir ? fs.realpathSync(options.cssDir) : undefined;
	var jsPath = options.jsDir ? fs.realpathSync(options.jsDir) : undefined;

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

		if(cssPath && (path.extname(file.relative) == '.css' ||
			path.extname(file.relative) == '.less') && isFileInPath(file, cssPath)) {
			cssFiles.push(file);
		}

		if(jsPath && path.extname(file.relative) == '.js' && isFileInPath(file, jsPath)) {
			jsFiles.push(file);
		}

		callback(null, file);
	}

	function endStream(callback) {
	    // create a system tmp directory to store our tmp files`
	    var tmpWorkingDir = tmp.dirSync({prefix: 'gulp_clientlibify_', unsafeCleanup: true}).name;

		var jcrRootPath = path.join(tmpWorkingDir, '/jcr_root');
	    var metaInfPath = path.join(tmpWorkingDir, '/META-INF');

	    var clientlibRootDir        = path.join(jcrRootPath, '/etc/designs/', options.category);
	    var clientlibFolderLocation = path.join(clientlibRootDir, '/clientlibs');
	    var vaultPath               = path.join(metaInfPath, '/vault');

    	fs.mkdirsSync(clientlibRootDir);

	    // create .content.xml for `/jcr_root/` folder
	    fs.copySync(templates.jcrRootContent, path.join(jcrRootPath, '/.content.xml'));

	    // create .content.xml for `/jcr_root/etc/` folder
	    fs.copySync(templates.folderContent, path.join(jcrRootPath, '/etc/.content.xml'));

	    // create .content.xml for `/jcr_root/etc/designs` folder
	    fs.copySync(templates.folderContent, path.join(jcrRootPath, '/etc/designs/.content.xml'));

		// create .content.xml for `/jcr_root/etc/designs/<category>/` folder
    	fs.copySync(templates.designContent, path.join(clientlibRootDir, '/.content.xml'));

		// create .content.xml for `/jcr_root/etc/designs/<category>/clientlibs` folder
	    var clientLibFileContents = _.template(fs.readFileSync(templates.clientlibContent, "utf8"))(options);
	    fs.outputFileSync(path.join(clientlibFolderLocation,'/.content.xml'), clientLibFileContents);

	    // create META-INF folder
	    fs.mkdirsSync(vaultPath);

	    // create `META-INF/vault/filter.xml` file
	    var filterFileContents = _.template(fs.readFileSync(templates.filterXml, "utf-8"))(options);
	    fs.outputFileSync(path.join(vaultPath, '/filter.xml'), filterFileContents);

	    // create `META-INF/vault/properties.xml` file
	    var propsFileContents = _.template(fs.readFileSync(templates.propertiesXml, "utf-8"))(options);
	    fs.outputFileSync(path.join(vaultPath, '/properties.xml'), propsFileContents);

	    // create js directory
	    if(jsFiles.length > 0) {
	    	gutil.log(PLUGIN_NAME, 'Processing JS files');
	    	generateClientLibrarySection('js', clientlibFolderLocation, jsFiles);
	    }

	    // create css directory
	    if(cssFiles.length > 0) {
	    	gutil.log(PLUGIN_NAME, 'Processing CSS files');
	    	generateClientLibrarySection('css', clientlibFolderLocation, cssFiles);
	    }

	    var that = this;

        // transfer other assets (images, fonts, etc)
	    if(options.assetsDirs.length) {
	      	gutil.log(PLUGIN_NAME, 'Processing Assets directories');

	      	options.assetsDirs.forEach(function (assetsSrc) {
	        	var assetsDest = path.basename(assetsSrc);
	        	gutil.log(PLUGIN_NAME, 'Processing assets in: ' + assetsSrc);

		        // check provided asset directory
		        if (!fs.lstatSync(assetsSrc).isDirectory()) {
	          		gutil.log(PLUGIN_NAME, gutil.colors.yellow(assetsSrc + ' is not a directory, skipping...'));
		          	return;
		        }

		        // copy files over to client library
		        fs.copySync(assetsSrc, path.join(clientlibFolderLocation, assetsDest));
	      	});
	    }

	    // zip up the clientlib
	    var directoriesToZip = [
	      {src: jcrRootPath, dest: '/jcr_root'},
	      {src: metaInfPath, dest: '/META-INF'}
	    ];

	    var zipFileLocation = path.join(options.dest, options.packageName + '-' + options.packageVersion + '.zip');

	    gutil.log(PLUGIN_NAME, 'Creating CRX package');

	    zipDirectory(directoriesToZip, zipFileLocation, function() {
			// only install the CRX package if the `installPackage` option
	      	// was set to `true`
    	  	if(options.installPackage) {
		        installPackage(zipFileLocation, function(err, httpResponse, body) {
	          		if(typeof httpResponse == 'undefined') {
		            	that.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Upload failed'));
		            	callback();
		            	return;
		          	} else if (httpResponse.statusCode !== 200) {
		            	that.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Upload failed: ',
		            				httpResponse.statusCode + ' - ' + httpResponse.statusMessage));
		            	callback();
		            	return;
		          	}
		          	gutil.log(PLUGIN_NAME, gutil.colors.green('CRX Package uploaded successfully'));
		          	callback();
	        	});
	      	} else {
	        	callback();
	      	}
	    });
	}

	/*****************************
     *    UTILITY FUNCTIONS      *
     *****************************/

    /**
     * Generates a section of the client library (JS or CSS), creating a js.txt or css.txt.
     * @param name i.e. 'js' or 'css'
     * @param clientlibFolderLocation
     * @param fileList
     */
    function generateClientLibrarySection(name, clientlibFolderLocation, fileList) {
 		var destFilePaths = [];
    	var sectionDir = fs.mkdirsSync(path.join(clientlibFolderLocation, '/', name));

		fileList.forEach(function(file) {
			var relativePath = file.relative;
			var dest = relativePath.substring(relativePath.indexOf(path.sep)+1, relativePath.length);
			fs.copySync(file.path, path.join(sectionDir, dest));
			destFilePaths.push(dest);
		});

		// create .txt file
	    fs.outputFileSync(path.join(clientlibFolderLocation, name + '.txt'),
                  "#base=".concat(name).concat('\n')
                  .concat(destFilePaths.join('\n')));
    }

    /**
     * Zips a set of directories and its contents using node-archiver.
     * @param directories
     * @param dest
     * @param zipCallback
     */
    function zipDirectory(directories, dest, callback) {
      	var archive = archiver.create('zip', {gzip: false});

	    // Where to write the file
	    var destStream = fs.createWriteStream(dest);

	    archive.on('error', function(err) {
	        this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Archiving failed', err));
	    });

      	archive.on('entry', function(file) {
    	    // do nothing
	  	});

      	destStream.on('error', function(err) {
	        this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'WriteStream failed', err));
	    });

	    destStream.on('close', function() {
	    	var size = archive.pointer();
	        gutil.log(PLUGIN_NAME, gutil.colors.green('Created ' + dest + ' (' + size + ' bytes)'));
	        callback();
	    });

      	archive.pipe(destStream);

  		directories.forEach(function(directory) {
	        if (fs.lstatSync(directory.src).isDirectory()) {
	          archive.directory(directory.src, directory.dest);
	        } else {
	          this.emit('error', new gutil.PluginError(PLUGIN_NAME, directory.src + ' is not a valid directory'));
	          return;
	        }
      	});

      	archive.finalize();
    }

	function isFileInPath(file, path) {
		return fs.realpathSync(file.path).indexOf(path) == 0;
	}

    /**
     * Installs a CRX package via an HTTP POST (basic authentication)
     * to an AEM instance.
     * @param zipFileLocation
     * @param callback
     */
    function installPackage(zipFileLocation, callback) {
  		var formData = {
        	'file': fs.createReadStream(zipFileLocation),
        	'force': 'true',
        	'install': 'true',
      	};

      	var postUri = uri()
        	.scheme(options.deployScheme)
        	.host(options.deployHost)
        	.port(options.deployPort)
        	.path('/crx/packmgr/service.jsp');

      	gutil.log(PLUGIN_NAME, 'Installing CRX package to ' + postUri.toString());

      	request.post({
          	url: postUri.toString(),
          	formData: formData,
          	headers: {
            	'Authorization': 'Basic ' +
                	new Buffer(options.deployUsername + ':' +
                           options.deployPassword).toString('base64')
          	}
    	}, callback);
    }

	return through.obj(bufferContents, endStream);
};
