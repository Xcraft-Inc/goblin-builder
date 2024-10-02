const fs = require('node:fs');
const path = require('node:path');
const {PackrStream} = require('msgpackr');

async function readdir(path, context) {
  const entries = fs.readdirSync(path);
  return {entries, ...context, type: 'readdir'};
}

async function stat(path, context) {
  const stats = fs.lstatSync(path);
  return {stats, ...context, type: 'stat'};
}

function throwIfUnsupported(stat, path) {
  if (stat.isFile() || stat.isDirectory() || stat.isSymbolicLink()) {
    return;
  }
  let unsupported = 'unknown';
  if (stat.isSocket()) {
    unsupported = 'symbolic link';
  } else if (stat.isFIFO()) {
    unsupported = 'FIFO';
  } else if (stat.isBlockDevice()) {
    unsupported = 'block device';
  } else if (stat.isCharacterDevice()) {
    unsupported = 'socket';
  }
  throw new Error(
    `Cannot serialize unsupported file type at '${path}': '${unsupported}'`
  );
}

async function snapshot(inputDir, outputFile) {
  const nextId = (() => {
    let counter = 0;
    return () => counter++;
  })();

  const index = {d: {}};
  const tasks = new Map();
  {
    const id = nextId();
    const task = readdir(inputDir, {
      id,
      folder: index.d,
      path: inputDir,
    });
    tasks.set(id, task);
  }

  while (tasks.size > 0) {
    const result = await Promise.race(tasks.values());
    tasks.delete(result.id);

    switch (result.type) {
      case 'readdir': {
        for (const name of result.entries) {
          const id = nextId();
          const location = path.join(result.path, name);
          const task = stat(location, {
            id,
            path: location,
            folder: result.folder,
            name,
          });
          tasks.set(id, task);
        }
        break;
      }

      case 'stat': {
        throwIfUnsupported(result.stats, result.path);
        if (result.stats.isDirectory()) {
          const dir = {};
          result.folder[result.name] = {d: dir};
          const id = nextId();
          const task = readdir(result.path, {
            id,
            path: result.path,
            folder: dir,
          });
          tasks.set(id, task);
          break;
        } else if (result.stats.isFile()) {
          const file = {
            get c() {
              return fs.readFileSync(result.path);
            },
          };
          result.folder[result.name] = {f: file};
          break;
        } else if (result.stats.isSymbolicLink()) {
          console.log(`skip symlink ${result.path}`);
        }
      }
    }
  }

  const packStream = new PackrStream({useRecords: false});
  const writeStream = fs.createWriteStream(outputFile);
  packStream.pipe(writeStream);
  await new Promise((resolve) => packStream.write(index, null, resolve));
}

module.exports = snapshot;
