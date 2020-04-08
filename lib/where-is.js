const path = require('path');
const fse = require('fs-extra');

module.exports = function whereIs(bin) {
  var fullLocation = null;

  var exists = process.env.PATH.split(path.delimiter).some(function (location) {
    fullLocation = path.join(location, bin);
    return fse.existsSync(fullLocation);
  });

  return exists ? fullLocation : null;
};
