'use strict';

const path = require('path');
const fse = require('fs-extra');
const {v4: uuidV4} = require('uuid');
const builder = require('electron-builder');
const Builder = require('./builder.js');
const getYearWeekNumber = require('./get-year-week-number.js');

const {Platform, Arch} = builder;

class AppBuilder extends Builder {
  /**
   * @param {object}  quest - Current quest.
   * @param {object}  options - Options.
   * @param {boolean} options.release - Sign the installer (win32).
   * @param {string}  options.arch - Specify the architecture ia32 or x64.
   * @param {boolean} options.forceDevel - Provide a devel build even if it's a public release.
   * @param {string}  options.outDir - Output package directory.
   * @param {object}  options.app - Whole app.json content (ignored of options.appDir).
   * @param {string}  options.appId - App ID.
   * @param {string}  options.variantId - Variant ID.
   * @param {string}  options.appDir - Location for the application to package.
   * @param {string}  options.libDir - Location for all local modules.
   * @param {string}  options.compression - Compression, for example 'store', 'normal' or 'maximum'.
   */
  constructor(quest, options) {
    super(quest, options);

    this._xProcess = require('xcraft-core-process')({
      logger: 'xlog',
      resp: quest.resp,
    });

    this._forceDevel = !!options.forceDevel;
    this._arch = options.arch;
    this._compression = options.compression;

    this._distDir = path.join(this._releaseDir, 'dist');
    this._resourcesDir = path.join(this._buildDir, 'resources');
    this._debugDir = path.join(this._buildDir, 'debug');

    /* Valid debian package stuff */
    this._debName = this._packageJson.name.replace('_', '-');
    this._debVersion = this._versionStr.replace(/-(alpha|beta|rc|pre)/, '~$1');
  }

  *_clean(next) {
    process.noAsar = true;
    fse.remove(this._productDir, next.parallel());
    fse.remove(this._resourcesDir, next.parallel());
    fse.remove(this._debugDir, next.parallel());
    yield next.sync();
    process.noAsar = false;

    fse.mkdirs(this._resourcesDir, next.parallel());
    yield next.sync();
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

  _esignInit() {
    const whereIs = require('xcraft-core-utils/lib/whereIs.js');
    this._esignPath = process.env.SIGNTOOL_PATH ?? whereIs('esign.exe');
    this._signedFiles = [];
  }

  async _esign(configuration) {
    if (!this._esignPath) {
      return;
    }

    const file = configuration.path;
    if (this._signedFiles[file]) {
      return;
    }

    const xProcess = require('xcraft-core-process')({
      logger: 'xlog',
      parser: 'esign',
      resp: this._quest.resp,
    });
    const util = require('util');
    const spawn = util.promisify(xProcess.spawn).bind(xProcess);

    const baseDelay = 120000;
    let retry = 0;
    do {
      const timeoutInt = setTimeout(() => {
        if (xProcess.getpid() > -1) {
          this._quest.log.warn(`kill (SIGINT) esign which seems dead`);
          process.kill(xProcess.getpid(), 'SIGINT');
        }
      }, baseDelay);
      const timeoutTerm = setTimeout(() => {
        if (xProcess.getpid() > -1) {
          this._quest.log.warn(`kill (SIGTERM) esign which seems dead`);
          process.kill(xProcess.getpid(), 'SIGTERM');
        }
      }, baseDelay + 5000);
      const timeoutKill = setTimeout(() => {
        if (xProcess.getpid() > -1) {
          this._quest.log.warn(`kill (SIGKILL) esign which seems dead`);
          process.kill(xProcess.getpid(), 'SIGKILL');
        }
      }, baseDelay + 10000);

      try {
        this._quest.log.info(`spawn ${this._esignPath} -l ${file}`);
        await spawn(this._esignPath, ['-l', file], {});
        retry = 0;
      } catch (ex) {
        ++retry;
        if (retry === 3) {
          throw ex;
        }
        this._quest.log.warn(`retry (${retry + 1}) signing of ${file}`);
      } finally {
        clearTimeout(timeoutInt);
        clearTimeout(timeoutTerm);
        clearTimeout(timeoutKill);
      }
    } while (retry > 0);

    this._signedFiles[file] = true;
    this._quest.log.info(`signed`);
  }

  *_electron() {
    let targets;
    let productName = this._packageJson.name;
    const buildTargets = {win32: ['zip'], linux: ['zip'], darwin: ['zip']};

    const getArch = () => {
      let arch = this._arch;

      if (!arch && this._app.arch) {
        if (typeof this._app.arch === 'string') {
          arch = this._app.arch;
        } else if (this._app.arch[process.platform]) {
          arch = this._app.arch[process.platform];
        }
      }

      switch (arch) {
        case 'ia32':
          return Arch.ia32;
        default:
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

    if (this._app?.build?.[process.platform]?.targets) {
      buildTargets[process.platform] = this._app.build[
        process.platform
      ].targets;
    }

    const copyright = `Copyright © 2016-${new Date().getFullYear()} Epsitec SA`;

    process.noAsar = true;

    let id = `ch.epsitec.${this._app.appId}`;
    if (this._variantId) {
      id += `.${this._variantId}`;
    }

    let electronVersion = null;
    try {
      electronVersion = this._packageJson.devDependencies.electron;
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
    const goblinFolderName = this._mainGoblinModule || this._app.versionFrom;

    const filter = [
      '!**/.eslintrc.js',
      '!**/.editorconfig',
      '!**/.gitmodules',
      '!**/{.DS_Store,.git,.gitignore,.gitattributes}',
      '!**/{thumbs.db}',
    ];

    const extraResources = [
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
        filter,
      },
    ];

    if (this._variantId) {
      extraResources.push(
        {
          from: path.join(
            this._appDir,
            this._app.appId,
            `resources@${this._variantId}`
          ),
          to: '.',
          filter,
        },
        {
          from: path.join(
            this._appDir,
            this._app.appId,
            `resources@${this._variantId}.${process.platform}`
          ),
          to: '.',
          filter,
        }
      );
    }

    let fileAssociations = [];

    if (this._app.fileAssociations) {
      fileAssociations = this._app.fileAssociations.map((ass) => {
        const ext = process.platform === 'darwin' ? 'icns' : 'ico';
        const assIcon = path.join(
          this._appDir,
          this._app.appId,
          `icons/${ass.ext}.${ext}`
        );
        if (fse.existsSync(assIcon)) {
          ass.icon = assIcon;
        }
        return ass;
      });
    }

    const options = {
      targets,
      config: {
        electronVersion,
        //electronDownload,
        buildDependenciesFromSource: true,
        npmRebuild: true,
        appId: id,
        productName: productName,
        copyright,
        asar: this._app.noAsar
          ? false
          : {
              smartUnpack: false,
            },
        asarUnpack: this._app.unpackedResources
          ? typeof this._app.unpackedResources === 'string'
            ? [this._app.unpackedResources]
            : this._app.unpackedResources
          : [],
        directories: {
          output: this._productDir,
          app: this._releaseDir,
        },
        extraResources: extraResources.concat(
          this._app.goblinResources
            ? (typeof this._app.goblinResources === 'string'
                ? [this._app.goblinResources]
                : this._app.goblinResources
              ).flatMap((goblinResourceFolder) => [
                {
                  from: path.join(
                    this._libDir,
                    goblinFolderName,
                    goblinResourceFolder
                  ),
                  to: '.',
                  filter,
                },
                {
                  from: path.join(
                    this._libDir,
                    goblinFolderName,
                    `${goblinResourceFolder}.${process.platform}`
                  ),
                  to: '.',
                  filter,
                },
              ])
            : []
        ),
        files: [
          ...filter,
          '!lib/**',
          '!**/node_modules/xcraft-dev-*',
          '!**/node_modules/{xcraft,goblin}-*/widgets/**/{index,widget,partial,props,reducer,styles,tasks,ui,view,compensator}.js',
          '!**/node_modules/{xcraft,goblin}-*/{test,species}',
        ]
          .concat(
            // Goblin resources folders have to be excluded from final .asar
            this._app.goblinResources
              ? (typeof this._app.goblinResources === 'string'
                  ? [this._app.goblinResources]
                  : this._app.goblinResources
                ).flatMap((goblinResourceFolder) => [
                  `!**/node_modules/${goblinFolderName}/${goblinResourceFolder}/*`,
                  `!**/node_modules/${goblinFolderName}.${process.platform}/${goblinResourceFolder}/*`,
                ])
              : []
          )
          .concat(
            this._app.excludedGoblinFiles
              ? (typeof this._app.excludedGoblinFiles === 'string'
                  ? [this._app.excludedGoblinFiles]
                  : this._app.excludedGoblinFiles
                ).map(
                  (excludedGoblinFile) =>
                    `!**/node_modules/${goblinFolderName}/${excludedGoblinFile}`
                )
              : []
          )
          .concat(
            this._app.excludedFiles
              ? (typeof this._app.excludedFiles === 'string'
                  ? [this._app.excludedFiles]
                  : this._app.excludedFiles
                ).map((excludedFile) => `!**/${excludedFile}`)
              : []
          ),
        fileAssociations,
        win: {
          target: buildTargets.win32,
          artifactName: this._app.squirrelWindows
            ? '${name}-${version}-${os}.${ext}'
            : '${name}.${ext}',
          legalTrademarks: copyright,
          sign: this._release ? this._esign.bind(this) : null,
          signDlls: true,
        },
        msi: {
          shortcutName: this._packageJson.productName,
        },
        squirrelWindows: this._app.squirrelWindows ?? {},
        linux: {
          target: buildTargets.linux,
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
          target: buildTargets.darwin,
          category: 'Finance',
          artifactName: this._app.squirrelMac
            ? '${name}-${version}-${os}.${ext}'
            : '${name}.${ext}',
          hardenedRuntime: true,
          entitlements: path.join(__dirname, 'entitlements.mac.inherit.plist'),
          notarize: process.env.APPLE_ID_TEAM
            ? {teamId: process.env.APPLE_ID_TEAM}
            : false,
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
            ...(this._app.debDeps || []),
          ],
          fpm: [`--name=${this._debName}`, `--version=${this._debVersion}`],
        },
      },
    };

    if (this._compression) {
      options.config.compression = this._compression;
    }

    /* Keep usual executables out of ASAR */
    options.config.asarUnpack.push('**/node_modules/**/*.node');
    switch (process.platform) {
      case 'darwin':
        options.config.asarUnpack.push('**/node_modules/**/*.{dylib,so}');
        break;

      case 'linux':
        options.config.asarUnpack.push('**/node_modules/**/*.so');
        break;

      case 'win32':
        options.config.asarUnpack.push('**/node_modules/**/*.{dll,exe}');
        break;
    }

    const icnsIcon = path.join(
      this._appDir,
      this._app.appId,
      'icons/icon.icns'
    );
    if (fse.existsSync(icnsIcon)) {
      options.config.mac.icon = icnsIcon;
    }

    const icoIcon = path.join(this._appDir, this._app.appId, 'icons/icon.ico');
    if (fse.existsSync(icoIcon)) {
      options.config.win.icon = icoIcon;
    }

    this._quest.log.verb(`Options:\n${JSON.stringify(options, null, 2)}`);
    const outputs = yield builder.build(options);
    this._quest.log.info(`Outputs:\n${outputs.join('\n')}`);

    process.noAsar = false;

    switch (process.platform) {
      case 'darwin': {
        if (!this._app.squirrelMac) {
          break;
        }
        const {darwinJSON} = require('./squirrel.js');
        const version = this._versionStr;
        const zip = `${this._packageJson.name}-${version}-mac.zip`;
        const downloadServer = this._app.squirrelMac.downloadServer;
        const extendedUrl = this._app.squirrelMac.extendedUrl;
        const majVersion = this._version[0];
        const routeVersion = this._isDevel ? 'dev' : `v${majVersion}`;
        yield darwinJSON({
          outputPath: path.join(this._productDir, 'RELEASES'),
          zipPath: path.join(this._productDir, zip),
          application: `${productName}.app`,
          version,
          url: `${downloadServer}/${
            extendedUrl && routeVersion.startsWith('v')
              ? `${routeVersion}.${this._version[1]}` // Add .[minor] in url
              : routeVersion
          }/darwin/x64/${zip}`,
        });
        break;
      }

      case 'win32': {
        if (!this._app.squirrelWindows) {
          break;
        }
        /* EXPERIMENTAL AND INCOMPLETE SQUIRREL WINDOWS BASED ON UPDATE.MAC
        const {winJSON} = require('./squirrel.js');
        const version = this._versionStr;
        const zip = `${this._packageJson.name}-${version}-win32.zip`;
        yield winJSON({
          outputPath: path.join(this._productDir, 'RELEASES'),
          zipPath: path.join(this._productDir, zip),
          nugetZip: `${this._packageJson.name}-${version}-full.nupkg`,
        });
        */
        break;
      }

      case 'linux': {
        if (buildTargets.linux.indexOf('deb') !== -1) {
          const debIn = `${this._packageJson.name}_${this._packageJson.version}_amd64.deb`;
          const debOut = `${this._debName}_${this._debVersion}_amd64.deb`;
          if (debIn !== debOut) {
            fse.moveSync(
              path.join(this._productDir, debIn),
              path.join(this._productDir, debOut)
            );
          }
        }
        if (buildTargets.linux.indexOf('zip') !== -1) {
          const zipIn = `${this._packageJson.name}-${this._packageJson.version}.zip`;
          const zipOut = `${this._packageJson.name}.zip`;
          fse.moveSync(
            path.join(this._productDir, zipIn),
            path.join(this._productDir, zipOut)
          );
        }
        break;
      }
    }
  }

  *run() {
    const xEnv = require('xcraft-core-env');
    const serverConfig = require('xcraft-core-etc')().load(
      'xcraft-core-server'
    );
    const {NODE_ENV, BUILD_NUMBER} = process.env;
    process.env.NODE_ENV = 'production';

    this._esignInit();

    if (serverConfig.useDevroot && process.platform === 'win32') {
      xEnv.devrootUpdate('bootstrap');
    }

    try {
      yield this._clean();

      /* bundle.js build */
      yield this._assets(true);
      yield this._installDeps(true);
      yield this._webpack();
      yield this._blacksmith();

      /* Cleanup for the finale electron build */
      this._cleanup();

      yield this._extraBuilds();

      if (process.platform === 'win32') {
        const [year, week] = getYearWeekNumber(new Date());
        process.env.BUILD_NUMBER = `${year.toString().substr(-2)}${week}`;
      }
      /* Normal package build */
      yield this._assets(false);
      yield this._electron();
    } finally {
      if (serverConfig.useDevroot && process.platform === 'win32') {
        xEnv.devrootUpdate();
      }
      process.env.NODE_ENV = NODE_ENV;
      process.env.BUILD_NUMBER = BUILD_NUMBER;
    }
  }
}

module.exports = AppBuilder;
