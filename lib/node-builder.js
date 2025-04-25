'use strict';

const path = require('path');
const fse = require('fs-extra');
const xFs = require('xcraft-core-fs');

const Builder = require('./builder.js');

class NodeBuilder extends Builder {
  /**
   * @param {object}  quest - Current quest.
   * @param {object}  options - Options.
   * @param {string}  options.outDir - Output package directory.
   * @param {object}  options.app - Whole app.json content (ignored of options.appDir).
   * @param {string}  options.appId - App ID.
   * @param {string}  options.variantId - Variant ID.
   * @param {string}  options.appDir - Location for the application to package.
   * @param {string}  options.libDir - Location for all local modules.
   * @param {string}  options.omit - Type of dependencies to omit ('dev' is set by default).
   */
  constructor(quest, options) {
    super(quest, options);

    this._xProcess = require('xcraft-core-process')({
      logger: 'xlog',
      resp: quest.resp,
    });

    this._packageDir = path.join(this._releaseDir, 'package');
    this._assetFiles = [];
    this._omit = ['--omit=dev'];
    if (options.omit?.length) {
      this._omit.push(...options.omit.map((w) => `--omit=${w}`));
    }
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
      const args = ['install', `--cache=${this._npmCacheDir}`, ...this._omit];
      const options = {
        cwd: this._releaseDir,
        env: {...process.env},
        shell: true,
      };

      if (this._target.runtime) {
        options.env.npm_config_runtime = this._target.runtime;
      }
      if (this._target.version) {
        options.env.npm_config_target = this._target.version;
      }
      if (this._target.arch) {
        options.env.npm_config_arch = this._target.arch;
        options.env.npm_config_target_arch = this._target.arch;
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

  _clean() {
    process.noAsar = true;
    fse.removeSync(this._productDir);
    process.noAsar = false;
  }

  async run() {
    this._clean();

    /* bundle.js build */
    if (this._hasBlacksmith()) {
      await this._assets(true);
      await this._installDeps(true);
      await this._blacksmith();
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

    const outputs = await this._extraBuilds();
    for (const output of outputs) {
      this._assetFiles.push(path.relative(this._releaseDir, output));
    }

    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await this._assets(false);
      this._assetsDeb();
      await this._npmInstall();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }
}

module.exports = NodeBuilder;
