/** @type {HTMLIFrameElement | null} */
const iframeEl = document.querySelector('iframe');

import {WebContainer} from './node_modules/@webcontainer/api/dist/index.js';

/** @type {import('@webcontainer/api').WebContainer}  */
let webcontainerInstance;

window.addEventListener('load', async () => {
  // Call only once
  webcontainerInstance = await WebContainer.boot();

  const snapshotResponse = await fetch('snapshot.bin');
  const snapshot = await snapshotResponse.arrayBuffer();

  await webcontainerInstance.fs.mkdir('horizon');
  await webcontainerInstance.mount(snapshot, {mountPoint: 'horizon'});

  // Wait for `server-ready` event
  webcontainerInstance.on('server-ready', (port, url) => {
    console.log(port, url);

    if (port === 9080) {
      iframeEl.src = url;
    }
  });

  const node = await webcontainerInstance.spawn('node', [
    'horizon/node_modules/xcraft-core-host/bin/host',
  ]);
  node.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(data);
      },
    })
  );
});
