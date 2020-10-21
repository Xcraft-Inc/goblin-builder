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

    /* FIXME: it's ugly because it's asynmetric according to the deb production */
    if (this._variantId) {
      this._westerosJson.appId += `@${this._variantId}`;
    }

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

    /* Valid debian package stuff */
    this._debName = this._packageJson.name.replace('_', '-');
    this._debVersion = this._versionStr.replace(/-(alpha|beta|rc|pre)/, '~$1');
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
      goblin: this._app.goblinEntryPoint || 'laboratory',
      mainGoblinModule: this._mainGoblinModule,
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

    let electronVersion = null;
    const packageLock = path.resolve(
      this._releaseDir,
      'full-package-lock.json'
    );
    try {
      const defLock = fse.readJSONSync(packageLock);
      electronVersion = defLock.dependencies.electron.version;
    } catch (ex) {
      /* Try with auto electron-builder discovery */
    }

    //let electronDownload = null;
    /* FIXME: need to investigate why the libstdc++ is not static
    if (process.platform === 'linux' && getArch() === Arch.x64) {
      this._quest.log.info(`use own electron build based on glibc v2.19`);
      electronDownload = {
        version: electronVersion,
        platform: 'linux',
        arch: 'x64',
        mirror: 'https://owncloud.epsitec.ch/owncloud/index.php/s/',
        customDir: 'XyexijfZ9sWTx7w',
        customFilename: `download`,
      };
    }
    */

    const options = {
      targets,
      config: {
        electronVersion,
        //electronDownload,
        appId: id,
        productName: productName,
        copyright,
        /* FIXME: babel-node is used by the pdf-renderer of goblin-polypheme.
         */
        asarUnpack: [
          '**/babel-cli/lib/_babel-node.js',
          '**/babel-cli/package.json',
        ].concat(
          this._app.unpackedResources
            ? typeof this._app.unpackedResources === 'string'
              ? [this._app.unpackedResources]
              : this._app.unpackedResources
            : []
        ),
        directories: {
          output: this._installDir,
          app: this._releaseDir,
        },
        extraResources: [
          {
            from: path.join(this._appDir, this._app.appId, 'resources'),
            to: '.',
            filter: '**/*',
          },
          {
            from: path.join(
              this._appDir,
              this._app.appId,
              `resources.${process.platform}`
            ),
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
          icon: path.join(this._appDir, this._app.appId, 'icons', 'icon.ico'),
          certificateSubjectName: this._release ? 'Epsitec SA' : null,
        },
        linux: {
          target: ['AppImage', 'deb'],
          executableName: this._packageJson.name,
          category: 'Office',
          packageCategory: 'non-free',
          synopsis: this._packageJson.description,
          desktop: {
            Encoding: 'UTF-8',
            Name: this._packageJson.productName,
            Icon: this._packageJson.name,
            Type: 'Application',
            Terminal: false,
          },
        },
        mac: {
          target: 'zip',
          category: 'Finance',
          artifactName: '${name}-${version}-${os}.${ext}',
        },
        deb: {
          depends: [
            // Defaults
            'gconf2',
            'gconf-service',
            'libnotify4',
            'libappindicator1',
            'libxtst6',
            'libnss3',
            'libxss1',
            // Missing in defaults
            'libgtk-3-0',
          ],
          fpm: [`--name=${this._debName}`, `--version=${this._debVersion}`],
        },
      },
    };

    const icnsIcon = path.join(
      this._appDir,
      this._app.appId,
      'icons/icon.icns'
    );
    if (fse.existsSync(icnsIcon)) {
      options.config.mac.icon = icnsIcon;
    }

    yield builder.build(options).then((res) => next(null, res), next);

    process.noAsar = false;

    switch (process.platform) {
      case 'darwin': {
        if (!this._app.squirrelMac) {
          break;
        }
        const makeSquirrelJSON = require('./make-squirrel-json');
        const version = this._versionStr;
        const zip = `${this._packageJson.name}-${version}-mac.zip`;
        const downloadServer = this._app.squirrelMac.downloadServer;
        const extendedUrl = this._app.squirrelMac.extendedUrl;
        yield makeSquirrelJSON({
          outputPath: path.join(this._installDir, 'RELEASES'),
          zipPath: path.join(this._installDir, zip),
          application: `${productName}.app`,
          version,
          url: `${downloadServer}/${
            extendedUrl && this._routeVersion.startsWith('v')
              ? `${this._routeVersion}.${this._version[1]}` // Add .[minor] in url
              : this._routeVersion
          }/darwin/x64/${zip}`,
        });
        break;
      }

      case 'linux': {
        const debIn = `${this._packageJson.name}_${this._packageJson.version}_amd64.deb`;
        const debOut = `${this._debName}_${this._debVersion}_amd64.deb`;
        fse.moveSync(
          path.join(this._installDir, debIn),
          path.join(this._installDir, debOut)
        );
      }
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
