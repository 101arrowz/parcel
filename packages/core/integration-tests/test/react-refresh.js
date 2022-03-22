// @flow strict-local
import assert from 'assert';
import invariant from 'assert';
import path from 'path';
import {
  bundle,
  bundler,
  getNextBuild,
  overlayFS as fs,
  sleep,
  run,
} from '@parcel/test-utils';
import getPort from 'get-port';
import type {BuildEvent} from '@parcel/types';
// flowlint-next-line untyped-import:off
import JSDOM from 'jsdom';
import nullthrows from 'nullthrows';

let MessageChannel;
try {
  ({MessageChannel} = require('worker_threads'));
} catch (_) {
  // eslint-disable-next-line no-console
  console.log(
    'Skipping React Fast Refresh tests because they require worker_threads',
  );
}

if (MessageChannel) {
  describe('react-refresh', function () {
    describe('synchronous (automatic runtime)', () => {
      const testDir = path.join(
        __dirname,
        '/integration/react-refresh-automatic',
      );

      let b,
        root,
        randoms = {};

      beforeEach(async () => {
        ({b, root, randoms} = await setup(path.join(testDir, 'index.html')));
      });

      it('retains state in functional components', async function () {
        await fs.mkdirp(testDir);
        await fs.copyFile(
          path.join(testDir, 'Foo.1.js'),
          path.join(testDir, 'Foo.js'),
        );
        assert.equal((await getNextBuild(b)).type, 'buildSuccess');

        // Wait for the hmr-runtime to process the event
        await sleep(100);

        let [, indexNum, appNum, fooText, fooNum] = root.textContent.match(
          /^([\d.]+) ([\d.]+) ([\w]+):([\d.]+)$/,
        );
        assert.equal(randoms.indexNum, indexNum);
        assert.equal(randoms.appNum, appNum);
        assert.equal(randoms.fooNum, fooNum);
        assert.equal(fooText, 'OtherFunctional');
      });
    });

    describe('synchronous', () => {
      const testDir = path.join(__dirname, '/integration/react-refresh');

      let b,
        root,
        window,
        subscription,
        randoms = {};

      beforeEach(async () => {
        ({b, root, window, subscription, randoms} = await setup(
          path.join(testDir, 'index.html'),
        ));
      });

      it('retains state in functional components', async function () {
        await fs.mkdirp(testDir);
        await fs.copyFile(
          path.join(testDir, 'Foo.1.js'),
          path.join(testDir, 'Foo.js'),
        );
        assert.equal((await getNextBuild(b)).type, 'buildSuccess');

        // Wait for the hmr-runtime to process the event
        await sleep(100);

        let [, indexNum, appNum, fooText, fooNum] = root.textContent.match(
          /^([\d.]+) ([\d.]+) ([\w]+):([\d.]+)$/,
        );
        assert.equal(randoms.indexNum, indexNum);
        assert.equal(randoms.appNum, appNum);
        assert.equal(randoms.fooNum, fooNum);
        assert.equal(fooText, 'OtherFunctional');
      });

      it('supports changing hooks in functional components', async function () {
        await fs.mkdirp(testDir);
        await fs.copyFile(
          path.join(testDir, 'Foo.2-hooks.js'),
          path.join(testDir, 'Foo.js'),
        );
        assert.equal((await getNextBuild(b)).type, 'buildSuccess');

        // Wait for the hmr-runtime to process the event
        await sleep(100);

        let [, indexNum, appNum, fooText, fooNum, fooNum2] =
          root.textContent.match(
            /^([\d.]+) ([\d.]+) ([\w]+):([\d.]+):([\d.]+)$/,
          );
        assert.equal(randoms.indexNum, indexNum);
        assert.equal(randoms.appNum, appNum);
        assert.notEqual(randoms.fooNum, fooNum);
        assert(fooNum2);
        assert.equal(fooText, 'Hooks');
      });

      it('retains state in parent components when swapping function and class component', async function () {
        await fs.mkdirp(testDir);
        await fs.copyFile(
          path.join(testDir, 'Foo.3-class.js'),
          path.join(testDir, 'Foo.js'),
        );
        assert.equal((await getNextBuild(b)).type, 'buildSuccess');

        // Wait for the hmr-runtime to process the event
        await sleep(100);

        let [, indexNum, appNum, fooText, fooNum] = root.textContent.match(
          /^([\d.]+) ([\d.]+) ([\w]+):([\d.]+)$/,
        );
        assert.equal(randoms.indexNum, indexNum);
        assert.equal(randoms.appNum, appNum);
        assert.notEqual(randoms.fooNum, fooNum);
        assert.equal(fooText, 'Class');
      });

      afterEach(async () => {
        await cleanup({subscription, window});
      });
    });

    describe('lazy child component', () => {
      const testDir = path.join(
        __dirname,
        '/integration/react-refresh-lazy-child',
      );

      let b,
        root,
        window,
        subscription,
        randoms = {};

      beforeEach(async () => {
        ({b, root, window, subscription, randoms} = await setup(
          path.join(testDir, 'index.html'),
        ));
      });

      it('retains state in async components on change', async function () {
        assert.equal(randoms.fooText, 'Async');

        await fs.mkdirp(testDir);
        await fs.copyFile(
          path.join(testDir, 'Async.1.js'),
          path.join(testDir, 'Async.js'),
        );
        assert.equal((await getNextBuild(b)).type, 'buildSuccess');

        // Wait for the hmr-runtime to process the event
        await sleep(100);

        let [, indexNum, appNum, fooText, fooNum] = root.textContent.match(
          /^([\d.]+) ([\d.]+) ([\w]+):([\d.]+)$/,
        );
        assert.equal(randoms.indexNum, indexNum);
        assert.equal(randoms.appNum, appNum);
        assert.equal(randoms.fooNum, fooNum);
        assert.equal(fooText, 'OtherAsync');
      });

      afterEach(async () => {
        await cleanup({subscription, window});
      });
    });

    it('does not error on inline scripts', async () => {
      let port = await getPort();
      let b = await bundle(
        path.join(
          __dirname,
          'integration/react-refresh-inline-script/index.html',
        ),
        {
          hmrOptions: {
            port,
          },
        },
      );

      await run(b, {}, {require: false});
    });
  });
}

async function setup(entry) {
  let port = await getPort(),
    b,
    window,
    randoms,
    subscription,
    root;

  b = bundler(entry, {
    inputFS: fs,
    outputFS: fs,
    serveOptions: {
      https: false,
      port,
      host: '127.0.0.1',
    },
    hmrOptions: {
      port,
    },
    defaultConfig: path.join(
      __dirname,
      'integration/custom-configs/.parcelrc-dev-server',
    ),
  });

  subscription = await b.watch();
  let bundleEvent: BuildEvent = await getNextBuild(b);
  invariant(bundleEvent.type === 'buildSuccess');
  let bundleGraph = bundleEvent.bundleGraph;
  let dom = await JSDOM.JSDOM.fromURL(
    'http://127.0.0.1:' + port + '/index.html',
    {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
    },
  );
  window = dom.window;
  await new Promise(res =>
    window.document.addEventListener('load', () => {
      res();
    }),
  );
  window.console.clear = () => {};
  window.MessageChannel = MessageChannel;
  root = window.document.getElementById('root');

  let bundle = nullthrows(bundleGraph.getBundles().find(b => b.type === 'js'));
  let parcelRequire = Object.keys(window).find(k =>
    k.startsWith('parcelRequire'),
  );
  // ReactDOM.render
  await window[parcelRequire](
    bundleGraph.getAssetPublicId(bundle.getEntryAssets().pop()),
  ).default();
  await sleep(100);

  let [, indexNum, appNum, fooText, fooNum] = root.textContent.match(
    /^([\d.]+) ([\d.]+) ([\w]+):([\d.]+)$/,
  );
  assert(indexNum);
  assert(appNum);
  assert(fooNum);

  randoms = {indexNum, appNum, fooText, fooNum};

  return {port, b, window, randoms, subscription, root};
}

async function cleanup({window, subscription}) {
  if (window) {
    window.close();
  }
  if (subscription) {
    await subscription.unsubscribe();
  }
}
