import test from 'ava';
import produce from 'immer';

import { watch } from '../src';

test('immer.js compatibility', (t) => {
  const initial = {
    a: {
      b: {
        c: [1, 2, 3],
      },
    },
  };

  // Immer auto-freezes the result so we have to make sure
  // that we won't crash on that.
  const changed = produce(initial, (data) => {
    data.a.b.c[2] = 4;
  });

  const { proxy, watcher } = watch(initial);
  t.is(watcher.unwrap(proxy.a.b.c[2]), 3);

  t.false(watcher.isChanged(initial, initial));
  t.true(watcher.isChanged(initial, changed));
});
