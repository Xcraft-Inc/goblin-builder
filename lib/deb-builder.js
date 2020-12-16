'use strict';

const path = require('path');
const fse = require('fs-extra');
const xFs = require('xcraft-core-fs');

const Builder = require('./builder.js');

class DebBuilder extends Builder {
  /**
   * @param {Object}  quest - Current quest.
   * @param {Object}  options - Options.
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

    this._packageDir = path.join(this._releaseDir, 'package');

    /* Main package.json */
    if (this._variantId) {
      this._packageJson.name += `-${this._variantId}`;
    }
    this._packageJson.node_deb = {
      init: 'systemd',
      entrypoints: {
        daemon: 'node_modules/xcraft-core-host/bin/host',
      },
      templates: {
        default_variables: './default_variables',
        postinst: './postinst',
      },
      maintainer: 'Epsitec SA <vente@epsitec.ch>', // FIXME
    };

    this._westerosJson.appConfigPath = `/var/lib/${this._app.appId}`;
    if (this._variantId) {
      this._westerosJson.appConfigPath += `-${this._variantId}`;
    }

    this._defaultVariables =
      'NODE_OPTIONS=--max-old-space-size=4096\nNODE_ENV=production\nXCRAFT_LOG=2\n';

    this._assetFiles = [];
  }

  _assetsDeb() {
    this._assetFiles.push('westeros.json');

    fse.writeFileSync(
      path.join(this._releaseDir, 'default_variables'),
      this._defaultVariables
    );

    const resourcesDir = path.join(this._appDir, this._app.appId, 'resources');
    if (fse.existsSync(resourcesDir)) {
      xFs.ls(resourcesDir).forEach((file) => {
        xFs.cp(
          path.join(resourcesDir, file),
          path.join(this._releaseDir, file)
        );
        this._assetFiles.push(file);
      });
    }

    const nodeDebPath = path.join(__dirname, '../../../node_modules/node-deb');
    const postinst = fse
      .readFileSync(path.join(nodeDebPath, 'templates/postinst'))
      .toString()
      .split('\n')
      .reduce((state, row) => {
        state.push(row);
        if (/^[ ]*chown/.test(row)) {
          state.push(`  mkdir -p '/var/lib/{{ node_deb_package_name }}'`);
          state.push(`  chown -R '{{ node_deb_user }}:{{ node_deb_group }}' '/var/lib/{{ node_deb_package_name }}'`); // prettier-ignore
        } else if (/^[ ]*# pass/.test(row)) {
          state.push(`      if [ -d './node_modules' ]; then`);
          state.push(`        if hash npm 2> /dev/null; then`);
          state.push(`          echo "Directory 'node_modules' exists. Running 'npm rebuild'"`); // prettier-ignore
          state.push(`          npm rebuild --production --unsafe-perm`);
          state.push(`        else`);
          state.push(`          echo "WARN: 'npm' was not on the path. Dependencies may be missing."`); // prettier-ignore
          state.push(`        fi`);
          state.push(`      fi`);
        }
        return state;
      }, []);
    fse.writeFileSync(
      path.join(this._releaseDir, 'postinst'),
      postinst.join('\n')
    );
  }

  *_npmInstall(next) {
    let npmrcSrc = null;
    let npmrcDst = null;

    try {
      npmrcSrc = path.join(this._libDir, '../.npmrc');
      npmrcDst = path.join(this._releaseDir, '.npmrc');
      if (fse.existsSync(npmrcSrc)) {
        fse.copyFileSync(npmrcSrc, npmrcDst);
      } else {
        npmrcSrc = null;
      }

      const npm = 'npm';
      const args = ['install', '--production'];
      const options = {
        cwd: this._releaseDir,
      };

      yield this._xProcess.spawn(npm, args, options, next);
    } finally {
      if (npmrcSrc) {
        fse.removeSync(npmrcDst);
      }
    }
  }

  *_nodeDeb(next) {
    const nodeDebPath = path.join(__dirname, '../../../node_modules/.bin');
    const nodeDeb = path.join(nodeDebPath, 'node-deb');
    let args = [
      '--install-strategy',
      'copy',
      '--',
      'config.js',
      ...this._assetFiles,
    ];

    const options = {
      cwd: this._releaseDir,
    };

    this._quest.log.info(`${nodeDeb} ${args.join(' ')}`);

    yield this._xProcess.spawn(nodeDeb, args, options, next);
  }

  *run() {
    /* bundle.js build */
    yield this._assets(true);
    yield this._installDeps();
    yield this._blacksmith();

    /* Cleanup for the finale build */
    this._cleanup();

    if (fse.existsSync(path.join(this._releaseDir, 'blacksmith'))) {
      this._assetFiles.push('blacksmith');
    }

    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      yield this._assets(false);
      this._assetsDeb();
      yield this._npmInstall();
      yield this._nodeDeb();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }
}

module.exports = DebBuilder;
