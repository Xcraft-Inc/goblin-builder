const watt = require('gigawatts');
const path = require('path');
const fse = require('fs-extra');
const {fileChecksum} = require('xcraft-core-utils/lib/file-crypto.js');

const darwinJSON = watt(function* ({
  outputPath,
  zipPath,
  application,
  version,
  url,
}) {
  const {size} = fse.statSync(zipPath);
  const checksum = yield fileChecksum(zipPath, {algorithm: 'sha256'});
  const squirrelInfo = {
    application,
    version,
    url,
    checksum,
    size,
  };
  fse.writeFileSync(outputPath, JSON.stringify(squirrelInfo, null, 2));
});

const winJSON = watt(function* ({outputPath, zipPath, nugetZip}) {
  const {size} = fse.statSync();
  const checksum = yield fileChecksum(zipPath, {
    algorithm: 'sha192',
  }).toUpperCase();
  // TODO: copy zipPath to nugetZip (move root to lib/net45)
  const squirrelInfo = `${checksum} ${nugetZip} ${size}`;
  fse.writeFileSync(outputPath, squirrelInfo);
});

module.exports = {
  darwinJSON,
  winJSON,
};
