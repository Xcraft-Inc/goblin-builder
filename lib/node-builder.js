'use strict';

const path = require('path');
const fse = require('fs-extra');
const xFs = require('xcraft-core-fs');

const Builder = require('./builder.js');

class NodeBuilder extends Builder {
  /**
   * @param {Object}  quest - Current quest.
   * @param {Object}  options - Options.
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

    this._packageDir = path.join(this._releaseDir, 'package');
    this._assetFiles = [];
  }

  _copyResources(resourcesName) {
    const resourcesDir = path.join(
      this._appDir,
      this._app.appId,
      resourcesName
    );
    if (!fse.existsSync(resourcesDir)) {
      return;
    }
    xFs.ls(resourcesDir).forEach((file) => {
      xFs.cp(path.join(resourcesDir, file), path.join(this._releaseDir, file));
      this._assetFiles.push(file);
    });
  }

  _assetsDeb() {
    this._assetFiles.push('goblins.json');

    this._copyResources('resources');
    this._copyResources(`resources.${process.platform}`);
    if (this._variantId) {
      this._copyResources(`resources@${this._variantId}`);
      this._copyResources(`resources@${this._variantId}.${process.platform}`);
    }
  }

  *_npmInstall(next) {
    let npmrcSrc = null;
    let npmrcDst = null;

    try {
      npmrcSrc = path.join(this._libDir, '../.npmrc');
      npmrcDst = path.join(this._releaseDir, '.npmrc');
      if (fse.existsSync(npmrcSrc)) {
        fse.copyFileSync(npmrcSrc, npmrcDst);
      } else {
        npmrcSrc = null;
      }

      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const args = ['install', '--omit=dev'];
      const options = {
        cwd: this._releaseDir,
        env: {...process.env},
      };

      if (this._target.runtime) {
        options.env.npm_config_runtime = this._target.runtime;
      }
      if (this._target.version) {
        options.env.npm_config_target = this._target.version;
      }

      yield this._xProcess.spawn(npm, args, options, next);
    } finally {
      if (npmrcSrc) {
        fse.removeSync(npmrcDst);
      }
    }
  }

  _hasBlacksmith() {
    const config = this._configJson[this._app.appId]['goblin-blacksmith'];
    if (!config || !config.renderers) {
      return false;
    }
    return true;
  }

  *run() {
    /* bundle.js build */
    if (this._hasBlacksmith()) {
      yield this._assets(true);
      yield this._installDeps(true);
      yield this._blacksmith();
    }

    /* Cleanup for the finale build */
    this._cleanup();

    const config = this._configJson[this._app.appId]['goblin-blacksmith'];
    if (config) {
      if (
        fse.existsSync(
          path.join(this._releaseDir, config.outputDir || 'blacksmith')
        )
      ) {
        this._assetFiles.push(config.outputDir || 'blacksmith');
      }
    }

    const outputs = yield this._extraBuilds();
    for (const output of outputs) {
      this._assetFiles.push(path.relative(this._releaseDir, output));
    }

    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      yield this._assets(false);
      this._assetsDeb();
      yield this._npmInstall();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }
}

module.exports = NodeBuilder;
