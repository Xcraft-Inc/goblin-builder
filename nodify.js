'use strict';

const path = require('path');

/**
 * Retrieve the list of available commands.
 *
 * @returns {Object} The list and definitions of commands.
 */
exports.xcraftCommands = function () {
  return require('./lib/service.js')(
    path.basename(__filename, '.js'),
    'node-builder'
  );
};
