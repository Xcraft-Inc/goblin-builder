'use strict';

const path = require('path');
const fse = require('fs-extra');
const watt = require('watt');
const fs = require('fs');

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

    /* Load all app configs */

    this._configJson = {};

    const loadAppConfig = appId => {
      if (this._configJson[appId]) {
        return;
      }

      this._configJson[appId] = utils.extractForEtc(options.appDir, appId);
      const hordesCfg = this._configJson[appId]['xcraft-core-horde'];

      if (hordesCfg && hordesCfg.hordes) {
        hordesCfg.hordes
          .filter(
            appId =>
              !hordesCfg.topology ||
              (hordesCfg.topology && !hordesCfg.topology[appId])
          )
          .forEach(appId => loadAppConfig(appId));
      }
    };

    loadAppConfig(this._app.appId);

    /* Load modules to link with this app */

    let deps = {
      'xcraft-core-host': true /* mandatory dependency for all apps */,
    };

    Object.keys(this._configJson).forEach(appId => {
      const appCfg = this._configJson[appId];
      if (appCfg['xcraft-core-horde']) {
        deps['xcraft-core-horde'] = true;
      }

      const serverCfg = appCfg['xcraft-core-server'];
      if (!serverCfg || !serverCfg.modules) {
        return;
      }

      serverCfg.modules.forEach(mod => {
        deps[mod] = true;
      });
    });

    if (!Object.keys(deps).length) {
      xFs
        .lsdir(options.libDir)
        .filter(dir => !/^xcraft-dev-.*/.test(dir))
        .forEach(dep => {
          deps[dep] = true;
        });
    }

    const extractDeps = (libDir, dep) => {
      const pkgJson = path.join(libDir, dep, 'package.json');
      const def = JSON.parse(fs.readFileSync(pkgJson));
      if (!def.dependencies) {
        return;
      }

      Object.keys(def.dependencies).forEach(dep => {
        if (!deps[dep] && fs.existsSync(path.join(libDir, dep))) {
          deps[dep] = true;
          extractDeps(libDir, dep);
        }
      });
    };

    Object.keys(deps).forEach(dep => extractDeps(options.libDir, dep));

    const modules = Object.keys(deps).map(dir =>
      path.relative(this._releaseDir, path.join(options.libDir, dir))
    );

    this._scrc = {
      modules,
    };

    /* Cleanup */

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
