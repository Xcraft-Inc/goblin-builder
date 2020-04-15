'use strict';

const path = require('path');
const fse = require('fs-extra');
const watt = require('gigawatts');
const fs = require('fs');

const {execSync} = require('child_process');
const {modules} = require('xcraft-core-utils');

class Builder {
  constructor(quest, options) {
    this._quest = quest;

    if (options.appDir) {
      this._app = JSON.parse(
        fse.readFileSync(path.join(options.appDir, options.appId, 'app.json'))
      );
    } else {
      this._app = options.app;
    }
    this._variantId = options.variantId;

    if (!this._app.versionFrom) {
      throw new Error(
        `the 'versionFrom' entry is missing in '${options.appId}' app.json file`
      );
    }

    const def = JSON.parse(
      fse.readFileSync(
        path.join(options.libDir, this._app.versionFrom, 'package.json')
      )
    );
    this._versionStr = def.version;
    this._version = this._versionStr.split('.');
    this._isDevel = /^[0-9]+-[\w.]+$/.test(this._version[2]); // like '9-rc01', '8-pre'

    this._libDir = options.libDir;
    this._buildDir = path.join(options.outDir, 'build');
    this._releaseDir = path.join(this._buildDir, 'release');
    this._packageDir = path.join(this._buildDir, 'package');
    this._appDir = options.appDir;
    this._release = !!options.release;

    let commit = this._app.appCommit;
    if (!commit) {
      try {
        commit = execSync('git rev-parse --short HEAD').toString().trim();
      } catch (ex) {
        /* ignore commit hash if git is not available */
      }
    }

    this._westerosJson = {
      appCompany: this._app.appCompany,
      appId: this._app.appId,
      appEnv: 'release',
    };

    if (commit) {
      this._westerosJson.appCommit = commit;
    }

    /* Main package.json */
    this._packageJson = {
      name: this._app.name,
      productName: this._app.productName || 'Westeros',
      description: this._app.description,
      author: 'Epsitec SA <vente@epsitec.ch>', // FIXME
      main: 'node_modules/xcraft-core-host/bin/host',
      version: this._versionStr,
      homepage: 'https://www.epsitec.ch', // FIXME
      repository: 'https://github.com/epsitec-sa', // FIXME
      license: 'Epsitec SA', // FIXME
      scripts: {
        postinstall: 'startcraft',
        postshrinkwrap: 'startcraft',
      },
      dependencies: {
        startcraft: '^2.0.0',
      },
    };

    /* Load all app configs */

    this._configJson = {};

    if (options.appDir) {
      this._configJson = modules.loadAppConfig(
        this._app.appId,
        options.appDir,
        {},
        this._variantId
      );
    }

    /* Retrieve the main goblin module if available
     * It's necessary for preparing a production node_modules with the whole
     * modules used by the bundle.js webpack output.
     */
    if (
      this._configJson[this._app.appId] &&
      this._configJson[this._app.appId]['goblin-client']
    ) {
      this._mainGoblinModule = this._configJson[this._app.appId][
        'goblin-client'
      ].mainGoblinModule;
    }

    /* Load modules to link with this app */

    const deps = modules.extractConfigDeps(options.libDir, this._configJson);
    const prodDeps = Object.assign({}, deps);
    const devDeps = Object.assign({}, deps);
    devDeps['xcraft-dev-frontend-deps'] = true; /* needed by webpack */

    Object.keys(prodDeps).forEach((dep) =>
      this.extractStartCraft(options.libDir, dep, false, prodDeps)
    );
    Object.keys(devDeps).forEach((dep) =>
      this.extractStartCraft(options.libDir, dep, true, devDeps)
    );

    const getModules = (deps) =>
      Object.keys(deps).map((dep) =>
        dep !== true
          ? path.relative(this._releaseDir, path.join(options.libDir, dep))
          : dep
      );

    this._scrcProd = {
      modules: getModules(prodDeps),
      substitutions: {'yoga-layout-prebuilt': 'xcraft-yoga-layout'},
    };
    this._scrcDev = {
      modules: getModules(devDeps),
      exclude: [
        'xcraft-dev-rules',
        'babel-env',
        'generic-js-env',
        'mai-chai',
        'prettier',
      ],
      substitutions: {'yoga-layout-prebuilt': 'xcraft-yoga-layout'},
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

  extractStartCraft(libDir, dep, isDev, deps = {}) {
    const pkgJson = path.join(libDir, dep, 'package.json');
    const def = JSON.parse(fs.readFileSync(pkgJson));

    const extract = (defDeps) => {
      Object.keys(defDeps).forEach((dep) => {
        if (!deps[dep] && fs.existsSync(path.join(libDir, dep))) {
          deps[dep] = path.relative(this._releaseDir, path.join(libDir, dep));
          this.extractStartCraft(libDir, dep, isDev, deps);
        }
      });
    };

    if (def.dependencies) {
      extract(def.dependencies);
    }

    if (isDev && def.devDependencies) {
      extract(def.devDependencies);
    }

    return deps;
  }
}

module.exports = Builder;
