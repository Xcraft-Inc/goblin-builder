const watt = require('gigawatts');
const fs = require('fs');
const {
  crypto: {fileChecksum},
} = require('xcraft-core-utils');

const makeSquirrelJSON = watt(function*(
  {outputPath, zipPath, application, version, url},
  next
) {
  const {size} = yield fs.stat(zipPath, next);
  const checksum = yield fileChecksum(zipPath, {algorithm: 'sha256'});
  const squirrelInfo = {
    application,
    version,
    url,
    checksum,
    size,
  };
  yield fs.writeFile(outputPath, JSON.stringify(squirrelInfo, null, 2), next);
});

module.exports = makeSquirrelJSON;
