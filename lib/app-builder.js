'use strict';

const path = require('path');
const fse = require('fs-extra');
const uuidV4 = require('uuid/v4');
const builder = require('electron-builder');
const Builder = require('./builder.js');
const whereIs = require('./where-is.js');
const getYearWeekNumber = require('./get-year-week-number.js');

const {Platform, Arch} = builder;

class AppBuilder extends Builder {
  /**
   * @param {Object}  quest - Current quest.
   * @param {Object}  options - Options.
   * @param {boolean} options.release - Sign the installer (win32).
   * @param {string}  options.arch - Specify the architecture ia32 or x64.
   * @param {boolean} options.forceDevel - Provide a devel build even if it's a public release.
   * @param {string}  options.outDir - Output package directory.
   * @param {Object}  options.app - Whole app.json content (ignored of options.appDir).
   * @param {string}  options.appId - App ID.
   * @param {string}  options.variantId - Variant ID.
   * @param {string}  options.appDir - Location for the application to package.
   * @param {string}  options.libDir - Location for all local modules (startcraft).
   */
  constructor(quest, options) {
    super(quest, options);

    this._xProcess = require('xcraft-core-process')({
      logger: 'xlog',
      resp: quest.resp,
    });

    this._forceDevel = !!options.forceDevel;
    this._arch =
      options.arch || (process.platform === 'win32' ? 'ia32' : 'x64');

    this._distDir = path.join(this._releaseDir, 'dist');
    this._resourcesDir = path.join(this._buildDir, 'resources');
    this._debugDir = path.join(this._buildDir, 'debug');
  }

  _fixInstallDir(forceDevel) {
    const majVersion = this._version[0];
    this._routeVersion = this._isDevel || forceDevel ? 'dev' : `v${majVersion}`;
    this._installDir = path.join(
      this._buildDir,
      `install-${this._routeVersion}`
    );
  }

  *_clean(next) {
    process.noAsar = true;
    fse.remove(this._installDir, next.parallel());
    fse.remove(this._resourcesDir, next.parallel());
    fse.remove(this._debugDir, next.parallel());
    yield next.sync();
    process.noAsar = false;

    fse.mkdirs(this._resourcesDir, next.parallel());
    yield next.sync();
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

  *_webpack() {
    yield this._quest.cmd('webpack.pack', {
      goblin: 'laboratory',
      jobId: uuidV4(),
      releasePath: this._releaseDir,
      outputPath: this._distDir,
      debugPath: this._debugDir,
      options: {
        sourceMap: false,
        target: 'electron-renderer',
      },
    });
  }

  *_assets(isDev, next) {
    const scrc = Object.assign({}, isDev ? this._scrcDev : this._scrcProd);
    scrc.modules = scrc.modules.slice();

    if (isDev && this._mainGoblinModule) {
      const location = path.relative(
        this._releaseDir,
        path.join(this._libDir, this._mainGoblinModule)
      );

      if (!scrc.modules.includes(location)) {
        scrc.modules.push(location);
      }

      const deps = this.extractStartCraft(
        this._libDir,
        this._mainGoblinModule,
        isDev
      );
      Object.keys(deps).forEach(dep => {
        if (!scrc.modules.includes(dep)) {
          scrc.modules.push(deps[dep]);
        }
      });
    }

    [
      {name: 'package.json', data: this._packageJson},
      {name: '.scrc', data: scrc},
      {name: 'westeros.json', data: this._westerosJson},
    ].forEach(item => {
      const output = path.join(this._releaseDir, item.name);
      fse.writeFile(
        output,
        JSON.stringify(item.data, null, 2),
        next.parallel()
      );
    });

    yield next.sync();
  }

  *_electron(next) {
    let targets;
    let productName = this._packageJson.name;

    const getArch = () => {
      switch (this._arch) {
        case 'ia32':
          return Arch.ia32;
        case 'x64':
          return Arch.x64;
      }
    };

    switch (process.platform) {
      case 'win32': {
        targets = Platform.WINDOWS.createTarget(null, getArch());
        break;
      }
      case 'linux': {
        targets = Platform.LINUX.createTarget(null, getArch());
        break;
      }
      case 'darwin': {
        targets = Platform.MAC.createTarget(null, getArch());
        productName = this._packageJson.productName.normalize('NFD');
        break;
      }
      default: {
        throw new Error('unsupported platform');
      }
    }

    const copyright = `Copyright © 2016-${new Date().getFullYear()} Epsitec SA`;

    process.noAsar = true;

    let id = `ch.epsitec.${this._app.appId}`;
    if (this._variantId) {
      id += `.${this._variantId}`;
    }

    const options = {
      targets,
      config: {
        appId: id,
        productName: productName,
        copyright,
        /* FIXME: specific asarUnpack patterns must be specified by the modules.
         * babel-node is used by the pdf-renderer of goblin-polypheme.
         */
        asarUnpack: [
          '**/babel-cli/lib/_babel-node.js',
          '**/babel-cli/package.json',
        ],
        directories: {
          output: this._installDir,
          app: this._releaseDir,
        },
        extraResources: [
          {
            from: `./app/${this._app.appId}/resources`,
            to: '.',
            filter: '**/*',
          },
        ],
        files: [
          '!**/node_modules/xcraft-dev-*',
          '!**/node_modules/{xcraft,goblin}-*/widgets/**/{index,widget,partial,props,reducer,styles,tasks,ui,view,compensator}.js',
          '!**/node_modules/{xcraft,goblin}-*/{test,species}',
        ],
        fileAssociations: this._app.fileAssociations || [],
        win: {
          target: 'zip',
          legalTrademarks: copyright,
          icon: path.join('app', this._app.appId, 'icons', 'icon.ico'),
          certificateSubjectName: this._release ? 'Epsitec SA' : null,
        },
        linux: {
          target: ['AppImage', 'deb'],
          executableName: this._packageJson.name,
          category: 'Office',
          packageCategory: 'non-free',
          synopsis: this._packageJson.description,
          desktop: {
            Name: this._packageJson.productName,
            Icon: this._packageJson.name,
            Type: 'Application',
            Terminal: false,
          },
        },
        mac: {
          target: 'zip',
          category: 'Finance',
          icon: path.join('app', this._app.appId, 'icons', 'icon.icns'),
          artifactName: '${name}-${version}-${os}.${ext}',
        },
      },
    };

    yield builder.build(options).then(res => next(null, res), next);

    process.noAsar = false;

    if (process.platform === 'darwin' && this._app.squirrelMac) {
      const makeSquirrelJSON = require('./make-squirrel-json');
      const version = this._app.version;
      const zip = `${this._packageJson.name}-${version}-mac.zip`;
      const downloadServer = this._app.squirrelMac.downloadServer;
      yield makeSquirrelJSON({
        outputPath: path.join(this._installDir, 'RELEASES'),
        zipPath: path.join(this._installDir, zip),
        application: `${productName}.app`,
        version,
        url: `${downloadServer}/${this._routeVersion}/darwin/x64/${zip}`,
      });
    }
  }

  *run() {
    this._fixInstallDir(false);
    yield this._clean();

    /* bundle.js build */
    yield this._assets(true);
    yield this._installDeps();
    yield this._webpack();

    /* Cleanup for the finale electron build */
    process.noAsar = true;
    yield fse.remove(path.join(this._releaseDir, 'node_modules'));
    process.noAsar = false;

    const prevNodeEnv = process.env.NODE_ENV;
    const prevSigntoolPath = process.env.SIGNTOOL_PATH;
    const prevBuildNumberEnv = process.env.BUILD_NUMBER;
    try {
      process.env.NODE_ENV = 'production';
      if (process.platform === 'win32') {
        process.env.SIGNTOOL_PATH = whereIs('signtool.exe');
        const [year, week] = getYearWeekNumber(new Date());
        process.env.BUILD_NUMBER = `${year.toString().substr(-2)}${week}`;
      }
      /* Normal package build */
      yield this._assets(false);
      yield this._electron();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      process.env.SIGNTOOL_PATH = prevSigntoolPath;
      process.env.BUILD_NUMBER = prevBuildNumberEnv;
    }
  }
}

module.exports = AppBuilder;
