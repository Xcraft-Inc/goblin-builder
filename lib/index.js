'use strict';

const path = require('path');
const fse = require('fs-extra');

exports.extractForEtc = (appDir, appId) => {
  const app = JSON.parse(fse.readFileSync(path.join(appDir, 'app.json')));

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
        fse.readFileSync(path.join(appDir, '..', mod.appId, 'app.json'))
      );
      delete app.xcraft[`${mod.moduleName}@${mod.appId}`];
      app.xcraft[mod.moduleName] = appConfig.xcraft[mod.moduleName];
    });

  return app.xcraft;
};
