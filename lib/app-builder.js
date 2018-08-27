'use strict';

const path = require('path');
const fse = require('fs-extra');
const uuidV4 = require('uuid/v4');
const builder = require('electron-builder');
const Builder = require('./builder.js');

const {Platform, Arch} = builder;

class AppBuilder extends Builder {
  /**
   * @param {Object}  quest - Current quest.
   * @param {Object}  options - Options.
   * @param {boolean} options.sign - Sign the installer (win32).
   * @param {boolean} options.forceDevel - Provide a devel build even if it's a public release.
   * @param {string}  options.outDir - Output package directory.
   * @param {string}  options.appId - App ID.
   * @param {string}  options.appDir - Location for the application to package.
   * @param {string}  options.libDir - Location for all local modules (startcraft).
   */
  constructor(quest, options) {
    super(quest, options);

    this._sign = !!options.sign;
    this._forceDevel = !!options.forceDevel;

    this._distDir = path.join(this._releaseDir, 'dist');
    this._resourcesDir = path.join(this._buildDir, 'resources');

    this._westerosJson = {
      appCompany: this._app.appCompany,
      appId: this._app.appId,
      appEnv: 'release',
    };
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
    yield next.sync();
    process.noAsar = false;

    fse.mkdirs(this._resourcesDir, next.parallel());
    yield next.sync();
  }

  *_webpack() {
    yield this._quest.cmd('webpack.pack', {
      goblin: 'laboratory',
      jobId: uuidV4(),
      outputPath: this._distDir,
      options: {
        sourceMap: false,
        target: 'electron-renderer',
      },
    });
  }

  *_assets(next) {
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

    yield next.sync();
  }

  *_electron(next) {
    let targets;
    let productName = this._packageJson.name;

    switch (process.platform) {
      case 'win32': {
        targets = Platform.WINDOWS.createTarget(null, Arch.ia32);
        break;
      }
      case 'linux': {
        targets = Platform.LINUX.createTarget(null, Arch.x64);
        break;
      }
      case 'darwin': {
        targets = Platform.MAC.createTarget(null, Arch.x64);
        productName = this._packageJson.productName;
        break;
      }
      default: {
        throw new Error('unsupported platform');
      }
    }

    const copyright = `Copyright © 2016-${new Date().getFullYear()} Epsitec SA`;

    process.noAsar = true;

    const options = {
      targets,
      config: {
        productName: productName,
        copyright,
        asarUnpack: [], // FIXME
        directories: {
          output: this._installDir,
          app: this._releaseDir,
        },
        files: [
          '!**/node_modules/xcraft-dev-*',
          '!**/node_modules/{xcraft,goblin}-*/widgets/**/{index,widget,partial,reducer,styles,tasks,ui,view}.js',
        ],
        fileAssociations: [], // FIXME
        win: {
          target: 'zip',
          legalTrademarks: copyright,
        },
        linux: {
          target: ['AppImage', 'deb'],
          category: 'Office',
          packageCategory: 'non-free',
          synopsis: this._packageJson.description,
          desktop: {
            Name: this._packageJson.productName,
            Exec: this._packageJson.name,
            Icon: this._packageJson.name,
            Type: 'Application',
            Terminal: false,
          },
        },
        mac: {
          target: 'zip',
          category: 'Finance',
        },
      },
    };

    if (this.sign) {
      options.certificateSubjectName = 'Epsitec SA'; // FIXME
    }

    yield builder.build(options).then(res => next(null, res), next);

    process.noAsar = false;
  }

  *run(next) {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    this._fixInstallDir(false);
    yield this._clean();

    this._webpack(next.parallel());
    this._assets(next.parallel());
    yield next.sync();

    /* Normal package build */
    yield this._electron();

    process.env.NODE_ENV = prevNodeEnv;
  }
}

module.exports = AppBuilder;
