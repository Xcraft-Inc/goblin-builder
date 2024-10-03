'use strict';

const path = require('node:path');
const snapshot = require('./blitz/snapshot.js');
const NodeBuilder = require('./node-builder.js');
const fse = require('fs-extra');

class BlitzBuilder {
  #nodeBuilder;
  #releaseDir;
  #productDir;
  #wwwDir;

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
    options.omit = ['peer'];
    this.#nodeBuilder = new NodeBuilder(quest, options);
    this.#releaseDir = this.#nodeBuilder._releaseDir;
    this.#productDir = this.#nodeBuilder._productDir;
    this.#wwwDir = path.join(this.#nodeBuilder._buildDir, 'www');
  }

  cleanReleaseDir() {
    const nodeModules = path.join(this.#releaseDir, 'node_modules');
    const libDir = path.join(this.#releaseDir, 'lib');

    for (const dir of fse.readdirSync(libDir)) {
      const src = path.join(this.#releaseDir, 'lib', dir);
      const dst = path.join(nodeModules, dir);

      if (!fse.existsSync(path.join(src, 'package.json'))) {
        continue;
      }

      fse.removeSync(dst);
      fse.copySync(src, dst);
      fse.removeSync(src);
    }

    fse.removeSync(libDir);
    fse.removeSync(path.join(nodeModules, '.bin'));
  }

  async generateBlitz() {
    const templates = path.join(__dirname, 'blitz/www');
    fse.ensureDirSync(this.#wwwDir);

    for (const filename of fse.readdirSync(templates)) {
      const file = path.join(templates, filename);
      const output = path.join(this.#wwwDir, filename);
      const data = fse.readFileSync(file, {encoding: 'utf-8'});
      fse.writeFileSync(
        output,
        data.replace(/{APP_PRODUCTNAME}/, this.#nodeBuilder._app.productName)
      );
    }

    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = [
      'install',
      `--cache=${this.#nodeBuilder._npmCacheDir}`,
      '--omit=dev',
    ];
    const options = {
      cwd: this.#wwwDir,
      env: {...process.env},
      shell: true,
    };

    await new Promise((resolve) => {
      this.#nodeBuilder._xProcess.spawn(npm, args, options, resolve);
    });

    fse.moveSync(this.#wwwDir, this.#productDir);
  }

  async run() {
    /* Generate the standard node output */
    await this.#nodeBuilder.run();

    this.cleanReleaseDir();

    await this.generateBlitz();

    fse.ensureDirSync(this.#productDir);
    const snapshotFile = path.join(this.#productDir, 'snapshot.bin');
    await snapshot(this.#releaseDir, snapshotFile);
  }
}

module.exports = BlitzBuilder;
