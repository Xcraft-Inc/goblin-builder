const watt = require('gigawatts');
const fs = require('fs');
const {fileChecksum} = require('xcraft-core-utils/lib/file-crypto.js');

const makeSquirrelJSON = watt(function* (
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
  fs.writeFileSync(outputPath, JSON.stringify(squirrelInfo, null, 2));
});

module.exports = makeSquirrelJSON;
