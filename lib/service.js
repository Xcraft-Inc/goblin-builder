'use strict';

const path = require('path');
const xHost = require('xcraft-core-host');
const Goblin = require('xcraft-core-goblin');

const logicState = {};
const logicHandlers = {};

// Singleton
module.exports = (goblinName, backend) => {
  const Builder = require(`./${backend}.js`);

  Goblin.registerQuest(goblinName, 'build', function*(quest, app, output) {
    const builder = new Builder(quest, {
      outDir: output,
      appDir: path.join(xHost.projectPath, 'app', app),
      libDir: path.join(xHost.projectPath, 'lib'),
    });

    yield builder.run();
  });

  const goblin = Goblin.configure(goblinName, logicState, logicHandlers);
  Goblin.createSingle(goblinName);
  return goblin;
};
