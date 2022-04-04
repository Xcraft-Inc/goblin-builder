'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');

const logicState = {};
const logicHandlers = {};

function splitAppId(fullAppId) {
  const [appId, variantId] = fullAppId.split('@');
  return {
    appId,
    variantId,
  };
}

// Singleton
module.exports = (goblinName, backend) => {
  const Builder = require(`./${backend}.js`);

  Goblin.registerQuest(goblinName, 'build', function* (
    quest,
    appId,
    output,
    $arch
  ) {
    const xHost = require('xcraft-core-host');
    const ids = splitAppId(appId);

    yield quest.me.buildOpts({
      appId: ids.appId,
      variantId: ids.variantId,
      appDir: path.join(xHost.projectPath, 'app'),
      libDir: path.join(xHost.projectPath, 'lib'),
      output,
      arch: $arch,
    });
  });

  Goblin.registerQuest(goblinName, 'build-release', function* (
    quest,
    appId,
    output,
    $arch
  ) {
    const xHost = require('xcraft-core-host');
    const ids = splitAppId(appId);

    yield quest.me.buildOpts({
      appId: ids.appId,
      variantId: ids.variantId,
      appDir: path.join(xHost.projectPath, 'app'),
      libDir: path.join(xHost.projectPath, 'lib'),
      output,
      release: true,
      arch: $arch,
    });
  });

  Goblin.registerQuest(goblinName, 'build-opts', function* (
    quest,
    appId,
    variantId,
    appDir,
    libDir,
    output,
    release,
    arch
  ) {
    if (!path.isAbsolute(output)) {
      output = path.resolve(output);
    }
    const builder = new Builder(quest, {
      outDir: output,
      appId,
      variantId,
      appDir,
      libDir,
      release,
      arch,
    });

    yield builder.run();
  });

  const goblin = Goblin.configure(goblinName, logicState, logicHandlers);
  Goblin.createSingle(goblinName);
  return goblin;
};
