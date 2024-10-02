'use strict';

const path = require('node:path');
const snapshot = require('./blitz/snapshot.js');
const NodeBuilder = require('./node-builder.js');

class BlitzBuilder {
  #nodeBuilder;
  #releaseDir;

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
    this.#nodeBuilder = new NodeBuilder(quest, options);
    this.#releaseDir = this.#nodeBuilder._releaseDir;
  }

  async run() {
    /* Generate the standard node output */
    await this.#nodeBuilder.run();

    const snapshotFile = path.join(this.#releaseDir, 'snapshot.bin');
    await snapshot(this.#releaseDir, snapshotFile);
  }
}

module.exports = BlitzBuilder;
