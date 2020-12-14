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
      optionalDependencies: {},
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

    /* FIXME: check if it's really needed since this module is mandatory
     *        with the Xcraft toolchain.
     */
    if (fse.existsSync(path.join(options.libDir, 'xcraft-core-host'))) {
      deps['xcraft-core-host'] = true;
    }

    const prodDeps = Object.assign({}, deps);
    const devDeps = Object.assign({}, deps);

    if (fse.existsSync(path.join(options.libDir, 'xcraft-dev-frontend-deps'))) {
      devDeps['xcraft-dev-frontend-deps'] = true; /* needed by webpack */
    }

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

    let substitutions = {};

    if (Object.keys(prodDeps).some((dep) => dep === 'goblin-polypheme')) {
      this._packageJson.optionalDependencies['xcraft-yoga-layout'] = '^1.9.4';
      //substitutions = {'yoga-layout-prebuilt': 'xcraft-yoga-layout'};
    }

    this._scrcProd = {
      modules: getModules(prodDeps),
      substitutions,
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
      substitutions,
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

    this._assets = this._assets.bind(this);
    this._blacksmith = this._blacksmith.bind(this);
    this._cleanup = this._cleanup.bind(this);
    this._installDeps = this._installDeps.bind(this);
    watt.wrapAll(this);
  }

  *_installDeps(next) {
    let npmrcSrc = null;
    let npmrcDst = null;
    const prevNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'development';
      process.env.STARTCRAFT_SYMLINK = 'false';

      npmrcSrc = path.join(this._libDir, '../.npmrc');
      npmrcDst = path.join(this._releaseDir, '.npmrc');
      if (fse.existsSync(npmrcSrc)) {
        fse.copyFileSync(npmrcSrc, npmrcDst);
      } else {
        npmrcSrc = null;
      }

      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const args = ['install'];
      const options = {
        cwd: this._releaseDir,
      };

      yield this._xProcess.spawn(npm, args, options, next);
    } finally {
      if (npmrcSrc) {
        fse.removeSync(npmrcDst);
      }
      delete process.env.STARTCRAFT_SYMLINK;
      process.env.NODE_ENV = prevNodeEnv;
    }
  }

  *_assets(isDev, next) {
    const scrc = Object.assign({}, isDev ? this._scrcDev : this._scrcProd);
    scrc.modules = scrc.modules.slice();

    if (isDev) {
      const mainGoblinModule = this._mainGoblinModule || 'goblin-laboratory';

      const location = path.relative(
        this._releaseDir,
        path.join(this._libDir, mainGoblinModule)
      );

      if (!scrc.modules.includes(location)) {
        scrc.modules.push(location);
      }

      const deps = this.extractStartCraft(
        this._libDir,
        mainGoblinModule,
        isDev
      );
      Object.keys(deps).forEach((dep) => {
        if (!scrc.modules.includes(dep)) {
          scrc.modules.push(deps[dep]);
        }
      });
    }

    [
      {name: 'package.json', data: this._packageJson},
      {name: '.scrc', data: scrc},
      {name: 'westeros.json', data: this._westerosJson},
    ].forEach((item) => {
      const output = path.join(this._releaseDir, item.name);
      fse.writeFile(
        output,
        JSON.stringify(item.data, null, 2),
        next.parallel()
      );
    });

    yield next.sync();
  }

  _cleanup() {
    process.noAsar = true;
    fse.removeSync(path.join(this._releaseDir, 'node_modules'));
    fse.removeSync(path.join(this._releaseDir, 'package.json'));
    fse.removeSync(path.join(this._releaseDir, 'full-package-lock.json'));
    fse.removeSync(path.join(this._releaseDir, '.scrc'));
    fse.removeSync(path.join(this._releaseDir, 'westeros.json'));
    process.noAsar = false;
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

  *_blacksmith() {
    const config = this._configJson[this._app.appId]['goblin-blacksmith'];
    if (!config || !config.renderers) {
      return;
    }

    const blacksmith = this._quest.getAPI('blacksmith');
    const mainGoblin = this._app.versionFrom;
    const outputPath = path.join(this._releaseDir, 'blacksmith');

    for (const renderer in config.renderers) {
      for (const outputFilename in config.renderers[renderer]) {
        const componentPath = path.join(
          this._releaseDir,
          'node_modules',
          config.renderers[renderer][outputFilename]
        );
        yield blacksmith.build({
          mainGoblin,
          componentPath,
          outputPath,
          outputFilename,
          releasePath: this._releaseDir,
        });
      }
    }
  }
}

module.exports = Builder;
