'use strict';

const path = require('path');
const fse = require('fs-extra');

const Builder = require('./builder.js');

class DebBuilder extends Builder {
  /**
   * @param {Object}  quest - Current quest.
   * @param {Object}  options - Options.
   * @param {string}  options.outDir - Output package directory.
   * @param {string}  options.appDir - Location for the application to package.
   * @param {string}  options.libDir - Location for all local modules (startcraft).
   */
  constructor(quest, options) {
    super(quest, options);

    this._xProcess = require('xcraft-core-process')({
      logger: 'xlog',
      resp: quest.resp,
    });

    this._packageDir = path.join(this._releaseDir, 'package');

    /* Main package.json */
    this._packageJson.node_deb = {
      init: 'systemd',
      entrypoints: {
        daemon: 'node_modules/.bin/xcraft-host',
      },
      templates: {
        default_variables: './default_variables',
      },
      maintainer: 'Epsitec SA <vente@epsitec.ch>', // FIXME
    };

    this._westerosJson = {
      appCompany: this._app.appCompany,
      appId: this._app.appId,
      appEnv: 'release',
    };

    this._defaultVariables = 'NODE_ENV=production\nXCRAFT_LOG=2\n';
  }

  *_clean(next) {
    yield fse.remove(this._releaseDir, next);
    yield fse.mkdirs(this._releaseDir, next);
  }

  *_assets(next) {
    const util = require('util');

    [
      {name: 'package.json', data: this._packageJson},
      {name: '.scrc', data: this._scrc},
      {name: 'westeros.json', data: this._westerosJson},
    ].forEach(item => {
      const output = path.join(this._releaseDir, item.name);
      fse.writeFile(
        output,
        JSON.stringify(item.data, null, 2),
        next.parallel()
      );
    });

    fse.writeFile(
      path.join(this._releaseDir, 'default_variables'),
      this._defaultVariables,
      next.parallel()
    );

    /* Generate the config.js file */
    fse.writeFile(
      path.join(this._releaseDir, 'config.js'),
      `'use strict'; module.exports = ${util.inspect(
        this._configJson,
        false,
        null
      )};`,
      next.parallel()
    );

    yield next.sync();
  }

  *_npmInstall(next) {
    const npm = 'npm';
    const args = ['install', '--production'];
    const options = {
      cwd: this._releaseDir,
    };

    yield this._xProcess.spawn(npm, args, options, next);
  }

  *_nodeDeb(next) {
    const nodeDebPath = path.join(__dirname, '../../../node_modules/.bin');
    const nodeDeb = path.join(nodeDebPath, 'node-deb');
    const args = ['--', 'config.js'];
    const options = {
      cwd: this._releaseDir,
    };

    this._quest.log.info(`${nodeDeb} ${args.join(' ')}`);

    yield this._xProcess.spawn(nodeDeb, args, options, next);
  }

  *run() {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    yield this._clean();
    yield this._assets();
    yield this._npmInstall();
    yield this._nodeDeb();

    process.env.NODE_ENV = prevNodeEnv;
  }
}

module.exports = DebBuilder;
