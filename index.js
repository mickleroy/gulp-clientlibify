'use strict';

var path    = require('path');
var gutil   = require('gulp-util');
var through = require('through2');
var assign  = require('object-assign');
var chalk   = require('chalk');
var plur    = require('plur');
var fs      = require('fs-extra');
var tmp     = require('tmp');
var _       = require('underscore');

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

    options.isoDateTime = new Date().toISOString();

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
	var fileUploaded = false;

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

		if(cssPath && (path.extname(file.relative) == '.css' || path.extname(file.relative) == '.less') && isFileInPath(file, cssPath)) {
			cssFiles.push(file);
			fileCount++;
		}

		if(jsPath && path.extname(file.relative) == '.js' && isFileInPath(file, jsPath)) {
			jsFiles.push(file);
			fileCount++;
		}

		callback(null, file);
	}

	function endStream(callback) {
	    // create a system tmp directory to store our tmp files`
	    var tmpWorkingDir = tmp.dirSync({prefix: 'gulp_clientlibify_', unsafeCleanup: true}).name;
    	gutil.log('Tmp directory is located at: ', tmpWorkingDir);

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
	    	gutil.log('Processing JS files');
	    	generateClientLibrarySection('js', clientlibRootDir, jsFiles);
	    }

	    // create css directory
	    if(cssFiles.length > 0) {
	    	gutil.log('Processing CSS files');
	    	generateClientLibrarySection('css', clientlibRootDir, cssFiles);
	    }

		//------------------------------
		if (fileUploaded) {
			gutil.log(PLUGIN_NAME, gutil.colors.green('CRX Package uploaded successfully'));
		} else {
			gutil.log(PLUGIN_NAME, gutil.colors.yellow('No files uploaded'));
		}

		//TODO: pass zip file through
		// this.push(zipFile);
		callback();
	}

	/*****************************
     *    UTILITY FUNCTIONS      *
     *****************************/

    /**
     * Generates a section of the client library (JS or CSS), creating a js.txt or css.txt.
     * @param name i.e. 'js' or 'css'
     * @param clientlibRootDir
     * @param fileList
     */
     function generateClientLibrarySection(name, clientlibRootDir, fileList) {
     	var destFilePaths = [];
    	var sectionDir = fs.mkdirsSync(path.join(clientlibRootDir, '/', name));

		fileList.forEach(function(file) {
			var relativePath = file.relative;
			var dest = relativePath.substring(relativePath.indexOf(path.sep)+1, relativePath.length);
			fs.copySync(file.path, path.join(sectionDir, dest));
			destFilePaths.push(dest);
		});

		// create .txt file
	    fs.outputFileSync(path.join(sectionDir, name + '.txt'),
                  "#base=".concat(name).concat('\n')
                  .concat(destFilePaths.join('\n')));
     }

	function isFileInPath(file, path) {
		return fs.realpathSync(file.path).indexOf(path) == 0;
	}

	return through.obj(bufferContents, endStream);
};
