'use strict';

const path = require('path');
const fse = require('fs-extra');
const watt = require('watt');
const util = require('util');

const xFs = require('xcraft-core-fs');
const utils = require('./index.js');

class Builder {
  constructor(quest, options) {
    this._quest = quest;

    this._app = JSON.parse(
      fse.readFileSync(path.join(options.appDir, options.appId, 'app.json'))
    );

    this._version = this._app.version.split('.');
    this._isDevel = /^[0-9]+-[\w.]+$/.test(this._version[2]); // like '9-rc01', '8-pre'

    this._buildDir = path.join(options.outDir, 'build');
    this._releaseDir = path.join(this._buildDir, 'release');
    this._packageDir = path.join(this._buildDir, 'package');
    this._appDir = options.appDir;

    /* Main package.json */
    this._packageJson = {
      name: this._app.name,
      productName: 'Westeros', // FIXME
      description: this._app.description,
      author: 'Epsitec SA <vente@epsitec.ch>', // FIXME
      main: 'node_modules/xcraft-core-host/bin/host',
      version: this._app.version,
      homepage: 'https://www.epsitec.ch', // FIXME
      repository: 'https://github.com/epsitec-sa', // FIXME
      license: 'Epsitec SA', // FIXME
      scripts: {
        postinstall: 'startcraft',
        postshrinkwrap: 'startcraft',
      },
      dependencies: {
        startcraft: '^1.0.0',
      },
    };

    const modules = xFs
      .lsdir(options.libDir)
      .filter(dir => !/^xcraft-dev-.*/.test(dir))
      .map(dir =>
        path.relative(this._releaseDir, path.join(options.libDir, dir))
      );

    this._scrc = {
      modules,
    };

    this._configJson = {};

    const loadAppConfig = appId => {
      if (this._configJson[appId]) {
        return;
      }

      this._configJson[appId] = utils.extractForEtc(options.appDir, appId);
      const hordesCfg = this._configJson[appId]['xcraft-core-horde'];

      if (hordesCfg && hordesCfg.hordes) {
        hordesCfg.hordes.forEach(appId => loadAppConfig(appId));
      }
    };

    loadAppConfig(this._app.appId);

    fse.removeSync(this._releaseDir);
    fse.mkdirsSync(this._releaseDir);

    /* Generate the config.js file */
    fse.writeFileSync(
      path.join(this._releaseDir, `config.js`),
      `'use strict';\nmodule.exports = ${JSON.stringify(
        this._configJson,
        null,
        2
      )};\n`
    );

    watt.wrapAll(this);
  }
}

module.exports = Builder;
