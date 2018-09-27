'use strict';

const path = require('path');
const Goblin = require('xcraft-core-goblin');

const logicState = {};
const logicHandlers = {};

// Singleton
module.exports = (goblinName, backend) => {
  const Builder = require(`./${backend}.js`);

  Goblin.registerQuest(goblinName, 'build', function*(quest, appId, output) {
    const xHost = require('xcraft-core-host');

    yield quest.me.buildOpts({
      appId,
      appDir: path.join(xHost.projectPath, 'app'),
      libDir: path.join(xHost.projectPath, 'lib'),
      output,
    });
  });

  Goblin.registerQuest(goblinName, 'build-opts', function*(
    quest,
    appId,
    appDir,
    libDir,
    output
  ) {
    const builder = new Builder(quest, {
      outDir: output,
      appId,
      appDir,
      libDir,
    });

    yield builder.run();
  });

  const goblin = Goblin.configure(goblinName, logicState, logicHandlers);
  Goblin.createSingle(goblinName);
  return goblin;
};
