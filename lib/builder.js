'use strict';

const path = require('path');
const fse = require('fs-extra');
const watt = require('gigawatts');
const fs = require('fs');
const xFs = require('xcraft-core-fs');

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

    this._goblinsJson = {
      appCompany: this._app.appCompany,
      appId: this._variantId
        ? this._app.appId + `@${this._variantId}`
        : this._app.appId,
      appEnv: 'release',
    };

    if (commit) {
      this._goblinsJson.appCommit = commit;
    }

    /* Main package.json */
    this._packageJson = {
      name: this._app.name,
      productName: this._app.productName || 'Goblins',
      description: this._app.description,
      author: 'Epsitec SA <vente@epsitec.ch>', // FIXME
      main: 'node_modules/xcraft-core-host/bin/host',
      version: this._versionStr,
      homepage: 'https://www.epsitec.ch', // FIXME
      repository: 'https://github.com/epsitec-sa', // FIXME
      license: 'Epsitec SA', // FIXME
      optionalDependencies: {},
      devDependencies: {
        'core-js': '^3.20.2',
        'electron': '14.2.4',
        'goblin-webpack': '^2.0.0',
        'react': '^17.0.2',
        'react-dom': '^17.0.2',
      },
      dependencies: {},
    };

    if (this._variantId) {
      this._packageJson.name += `-${this._variantId}`;
    }

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

    this._depsProd = getModules(prodDeps);
    this._depsDev = getModules(devDeps);

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
    this._extraBuilds = this._extraBuilds.bind(this);
    this._installDeps = this._installDeps.bind(this);
    watt.wrapAll(this);
  }

  *_installDeps(isDev, next) {
    let npmrcSrc = null;
    let npmrcDst = null;
    const prevNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = isDev ? 'development' : 'production';

      npmrcSrc = path.join(this._libDir, '../.npmrc');
      npmrcDst = path.join(this._releaseDir, '.npmrc');
      if (fse.existsSync(npmrcSrc)) {
        fse.copyFileSync(npmrcSrc, npmrcDst);
      } else {
        npmrcSrc = null;
      }

      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const args = ['install'];
      if (!isDev) {
        args.push('--production');
      }
      const options = {
        cwd: this._releaseDir,
      };

      yield this._xProcess.spawn(npm, args, options, next);
    } finally {
      if (npmrcSrc) {
        fse.removeSync(npmrcDst);
      }
      process.env.NODE_ENV = prevNodeEnv;
    }
  }

  *_assets(isDev, next) {
    const deps = isDev ? this._depsDev.slice() : this._depsProd.slice();

    if (isDev) {
      const mainGoblinModule = this._mainGoblinModule || 'goblin-laboratory';

      const location = path.relative(
        this._releaseDir,
        path.join(this._libDir, mainGoblinModule)
      );

      if (!deps.includes(location)) {
        deps.push(location);
      }

      const _deps = this.extractStartCraft(
        this._libDir,
        mainGoblinModule,
        isDev
      );
      Object.keys(_deps).forEach((dep) => {
        if (!deps.includes(dep)) {
          deps.push(_deps[dep]);
        }
      });
    }

    this._packageJson.dependencies = {};

    deps.forEach((dep) => {
      dep = path.basename(dep);
      const output = path.join(this._releaseDir, 'lib', dep);
      xFs.cp(path.join(this._libDir, dep), output);
      this._packageJson.dependencies = Object.assign(
        {[dep]: `file:${path.relative(this._releaseDir, output)}`},
        this._packageJson.dependencies
      );
    });

    if (isDev) {
      fse.mkdirSync(path.join(this._releaseDir, 'node_modules'));
    }

    [
      {name: 'package.json', data: this._packageJson},
      {name: 'goblins.json', data: this._goblinsJson},
    ].forEach((item) => {
      const output = path.join(this._releaseDir, item.name);
      fse.writeFile(
        output,
        JSON.stringify(item.data, null, 2),
        next.parallel()
      );
    });

    yield next.sync();

    const packageLock = path.join(this._libDir, '../package-lock.json');
    if (fse.existsSync(packageLock)) {
      fse.copyFileSync(
        packageLock,
        path.join(this._releaseDir, 'package-lock.json')
      );
    }
  }

  _cleanup() {
    process.noAsar = true;
    fse.removeSync(path.join(this._releaseDir, 'lib'));
    fse.removeSync(path.join(this._releaseDir, 'node_modules'));
    fse.removeSync(path.join(this._releaseDir, 'package.json'));
    fse.removeSync(path.join(this._releaseDir, 'package-lock.json'));
    fse.removeSync(path.join(this._releaseDir, 'goblins.json'));
    process.noAsar = false;
  }

  *_blacksmith() {
    const config = this._configJson[this._app.appId]['goblin-blacksmith'];
    if (!config || !config.renderers) {
      return;
    }

    const blacksmith = this._quest.getAPI('blacksmith');
    const outputPath = path.join(
      this._releaseDir,
      config.outputDir || 'blacksmith'
    );

    for (const renderer in config.renderers) {
      for (const filename in config.renderers[renderer]) {
        const fileConfig = config.renderers[renderer][filename];
        const componentPath = path.join(
          this._releaseDir,
          'node_modules',
          fileConfig.entry
        );
        yield blacksmith.build({
          backend: renderer,
          mainGoblin: fileConfig.goblin,
          componentPath,
          outputPath,
          outputFilename: `.${filename}`,
          assets: fileConfig.assets,
          publicPath: fileConfig.publicPath,
          releasePath: this._releaseDir,
        });
      }
    }
  }

  *_extraBuilds() {
    const outputs = [];

    if (!this._app.extraBuilds) {
      return outputs;
    }

    for (const appId in this._app.extraBuilds) {
      const {builder, outputDir, distDir} = this._app.extraBuilds[appId];
      let output = path.join(
        this._releaseDir,
        distDir ? `.${outputDir}` : outputDir
      );

      yield this._quest.cmd(`${builder}.build`, {appId, output});

      if (distDir) {
        const dist = path.join(this._releaseDir, `.${distDir}`);
        const _output = path.join(this._releaseDir, outputDir);
        xFs.cp(dist, _output);
        xFs.rm(output);
        output = _output;
      }

      outputs.push(output);
    }

    return outputs;
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

    if (def.optionalDependencies) {
      extract(def.optionalDependencies);
    }

    if (isDev && def.devDependencies) {
      extract(def.devDependencies);
    }

    return deps;
  }
}

module.exports = Builder;
