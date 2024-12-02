document.querySelector(
  '#app'
).innerHTML = `<iframe src="loading.html"></iframe>`;

/** @type {HTMLIFrameElement | null} */
const iframeEl = document.querySelector('iframe');

import {
  WebContainer,
  auth,
} from './node_modules/@webcontainer/api/dist/index.js';

/** @type {import('@webcontainer/api').WebContainer}  */
let webcontainerInstance;

window.addEventListener('load', async () => {
  const clientId = '{APP_CLIENTID}';
  if (clientId) {
    auth.init({clientId, scope: ''});
  }
  webcontainerInstance = await WebContainer.boot();

  const chunks = {APP_CHUNKS};

  const list = [];
  let length = 0;
  for (let idx = 0; idx < chunks; ++idx) {
    const response = await fetch(`snapshot.bin.${idx}`, {cache: 'no-cache'});
    const blob = await response.blob();
    const bytes = await blob.arrayBuffer();
    list.push(bytes);
    length += bytes.byteLength;
  }

  const snapshot = new Uint8Array(length);
  let offset = 0;
  list.forEach((item) => {
    snapshot.set(new Uint8Array(item), offset);
    offset += item.byteLength;
  });

  await webcontainerInstance.fs.mkdir('xcraft');
  await webcontainerInstance.mount(snapshot, {
    mountPoint: 'xcraft',
  });

  webcontainerInstance.on('server-ready', (port, url) => {
    console.log(port, url);
    if (port === 9080) {
      iframeEl.src = url;
    }
  });

  const node = await webcontainerInstance.spawn('node', [
    'xcraft/node_modules/xcraft-core-host/bin/host',
    `--href=${window.location.href}`,
    `--locale=${navigator.language}`,
  ]);
  node.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(data);
      },
    })
  );
});
