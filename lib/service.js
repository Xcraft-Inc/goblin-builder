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

    const builder = new Builder(quest, {
      outDir: output,
      appId,
      appDir: path.join(xHost.projectPath, 'app'),
      libDir: path.join(xHost.projectPath, 'lib'),
    });

    yield builder.run();
  });

  const goblin = Goblin.configure(goblinName, logicState, logicHandlers);
  Goblin.createSingle(goblinName);
  return goblin;
};
