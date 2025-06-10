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

  _assets() {
    const deps = this._depsProd.slice();

    this._packageJson.dependencies = {};
    this._packageJson.devDependencies = {};
    deps.forEach((dep) => {
      dep = path.basename(dep);
      const pkg = fse.readJSONSync(
        path.join(this._libDir, dep, 'package.json')
      );
      this._packageJson.dependencies = Object.assign(
        {[dep]: pkg.version},
        this._packageJson.dependencies
      );
    });

    [
      {name: 'package.json', data: this._packageJson},
      {name: 'goblins.json', data: this._goblinsJson},
    ].forEach((item) => {
      const output = path.join(this._releaseDir, item.name);
      fse.writeFileSync(output, JSON.stringify(item.data, null, 2));
    });
  }

  _assetsNpx() {
    this._assetFiles.push('goblins.json');

    this._copyResources('resources');
    this._copyResources(`resources.${process.platform}`);
    if (this._variantId) {
      this._copyResources(`resources@${this._variantId}`);
      this._copyResources(`resources@${this._variantId}.${process.platform}`);
    }
  }

  _clean() {
    process.noAsar = true;
    fse.removeSync(this._productDir);
    process.noAsar = false;
  }

  async run() {
    this._clean();
    this._cleanup();

    const outputs = await this._extraBuilds();
    for (const output of outputs) {
      this._assetFiles.push(path.relative(this._releaseDir, output));
    }

    this._assets();
    this._assetsNpx();
  }
}

module.exports = NodeBuilder;
