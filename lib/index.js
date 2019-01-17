'use strict';

const path = require('path');
const fse = require('fs-extra');
const xFs = require('xcraft-core-fs');

exports.extractForEtc = (appDir, appId) => {
  const app = JSON.parse(
    fse.readFileSync(path.join(appDir, appId, 'app.json'))
  );

  Object.keys(app.xcraft)
    .filter(key => key.includes('@'))
    .map(key => {
      const arr = key.split('@');
      return {
        moduleName: arr[0],
        appId: arr[1],
      };
    })
    .forEach(mod => {
      const appConfig = JSON.parse(
        fse.readFileSync(path.join(appDir, mod.appId, 'app.json'))
      );
      delete app.xcraft[`${mod.moduleName}@${mod.appId}`];
      app.xcraft[mod.moduleName] = appConfig.xcraft[mod.moduleName];
    });

  return app.xcraft;
};

exports.loadAppConfig = (appId, appDir, configJson = {}) => {
  if (configJson[appId]) {
    return;
  }

  configJson[appId] = exports.extractForEtc(appDir, appId);
  const hordesCfg = configJson[appId]['xcraft-core-horde'];

  if (hordesCfg && hordesCfg.hordes) {
    hordesCfg.hordes
      .filter(
        appId =>
          !hordesCfg.topology ||
          (hordesCfg.topology && !hordesCfg.topology[appId])
      )
      .forEach(appId => exports.loadAppConfig(appId, appDir, configJson));
  }

  return configJson;
};

exports.extractConfigDeps = (libDir, configJson) => {
  const deps = {
    'xcraft-core-host': true /* mandatory dependency for all apps */,
  };

  Object.keys(configJson).forEach(appId => {
    const appCfg = configJson[appId];
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
      .lsdir(libDir)
      .filter(dir => !/^xcraft-dev-.*/.test(dir))
      .forEach(dep => {
        deps[dep] = true;
      });
  }

  return deps;
};

exports.extractAllDeps = (appId, libDir, configJson) => {
  const newDeps = exports.extractConfigDeps(libDir, configJson);

  const filters = [/^xcraft-(core|contrib)/];
  const serverCfg = configJson[appId]['xcraft-core-server'];
  if (serverCfg) {
    if (serverCfg.userModulesFilter) {
      filters.push(new RegExp(serverCfg.userModulesFilter));
    }
  }

  const extract = deps => {
    let newDep = false;

    Object.keys(deps)
      .map(dep => {
        const def = JSON.parse(
          fse.readFileSync(path.join(libDir, dep, 'package.json'))
        );
        return def.dependencies ? Object.keys(def.dependencies) : [];
      })
      .forEach(_deps =>
        _deps
          .filter(
            dep =>
              !newDeps.hasOwnProperty(dep) &&
              filters.some(filter => filter.test(dep))
          )
          .forEach(dep => {
            newDep = true;
            newDeps[dep] = dep;
          })
      );

    if (newDep) {
      extract(newDeps);
    }
  };

  extract(newDeps);
  return Object.keys(newDeps);
};

exports.extractAllJs = (libDir, modules) => {
  let list = [];

  modules.forEach(mod => {
    const location = path.join(libDir, mod);
    const files = xFs.lsall(location).filter(file => /\.js$/.test(file));
    list = list.concat(files);
  });

  return list;
};
