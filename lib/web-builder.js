'use strict';

const path = require('path');
const fse = require('fs-extra');
const {v4: uuidV4} = require('uuid');
const Builder = require('./builder.js');

class AppBuilder extends Builder {
  /**
   * @param {Object}  quest - Current quest.
   * @param {Object}  options - Options.
   * @param {boolean} options.release - Sign the installer (win32).
   * @param {string}  options.arch - Specify the architecture ia32 or x64.
   * @param {boolean} options.forceDevel - Provide a devel build even if it's a public release.
   * @param {string}  options.outDir - Output package directory.
   * @param {Object}  options.app - Whole app.json content (ignored of options.appDir).
   * @param {string}  options.appId - App ID.
   * @param {string}  options.variantId - Variant ID.
   * @param {string}  options.appDir - Location for the application to package.
   * @param {string}  options.libDir - Location for all local modules.
   */
  constructor(quest, options) {
    super(quest, options);

    this._xProcess = require('xcraft-core-process')({
      logger: 'xlog',
      resp: quest.resp,
    });

    this._forceDevel = !!options.forceDevel;
    this._arch =
      options.arch || (process.platform === 'win32' ? 'ia32' : 'x64');

    this._distDir = path.join(this._releaseDir, 'dist');
    this._resourcesDir = path.join(this._buildDir, 'resources');
    this._debugDir = path.join(this._buildDir, 'debug');
  }

  _fixInstallDir(forceDevel) {
    const majVersion = this._version[0];
    this._routeVersion = this._isDevel || forceDevel ? 'dev' : `v${majVersion}`;
    this._installDir = path.join(
      this._buildDir,
      `install-${this._routeVersion}`
    );
  }

  *_clean(next) {
    process.noAsar = true;
    fse.remove(this._installDir, next.parallel());
    fse.remove(this._resourcesDir, next.parallel());
    fse.remove(this._debugDir, next.parallel());
    yield next.sync();
    process.noAsar = false;

    fse.mkdirs(this._resourcesDir, next.parallel());
    yield next.sync();
  }

  *_webpack() {
    yield this._quest.cmd('webpack.pack', {
      goblin: 'laboratory',
      mainGoblinModule: this._mainGoblinModule,
      jobId: uuidV4(),
      releasePath: this._releaseDir,
      outputPath: this._distDir,
      debugPath: this._debugDir,
      options: {
        sourceMap: false,
        indexFile: 'index-browsers.js',
        target: 'web',
      },
    });
  }

  *run() {
    this._fixInstallDir(false);
    yield this._clean();

    /* bundle.js build */
    yield this._assets(true);
    yield this._installDeps(true);
    yield this._webpack();
  }
}

module.exports = AppBuilder;
