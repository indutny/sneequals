import test from 'ava';

import { wrap, wrapAll } from '../src';

test('placing sub-property object into wrapped result', (t) => {
  const input = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const { proxy, watcher } = wrap(input);

  const derived = watcher.unwrap({
    y: proxy.x.y,
  });
  watcher.freeze();

  t.is(derived.y, input.x.y);

  t.false(watcher.isChanged(input, input), 'input should be equal to itself');
  t.false(
    watcher.isChanged(input, { ...input, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.false(
    watcher.isChanged(input, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing deeply accessed subojects should not cause invalidation',
  );
  t.true(
    watcher.isChanged(input, {
      x: {
        y: 2,
      },
      z: 3,
    }),
    'replacing deeply accessed property should cause invalidation',
  );
});

test('placing and accessing sub-property object into wrapped result', (t) => {
  const input = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const { proxy, watcher } = wrap(input);

  const derived = watcher.unwrap({
    x: proxy.x,
    y: proxy.x.y,
  });
  watcher.freeze();

  t.is(derived.x, input.x);
  t.is(derived.y, input.x.y);

  t.false(watcher.isChanged(input, input), 'input should be equal to itself');
  t.false(
    watcher.isChanged(input, { ...input, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.true(
    watcher.isChanged(input, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing fully-copied subojects should cause invalidation',
  );
});

test('nested wraps', (t) => {
  const input = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const { proxy: p1, watcher: w1 } = wrap(input);
  const { proxy: p2, watcher: w2 } = wrap(p1.x);

  const derived = w1.unwrap({
    y: w2.unwrap(p2.y),
  });
  t.is(derived.y, 1);

  w2.freeze();

  t.false(w2.isChanged(p1.x, p1.x), 'outer: proxy should be equal to itself');
  t.false(
    w2.isChanged(p1.x, { y: 1 }),
    'outer: proxy should be equal to its copy',
  );
  t.true(
    w2.isChanged(p1.x, { y: 2 }),
    'outer: value different from proxy should be detected',
  );

  t.false(
    w2.isChanged(p1.x, input.x),
    'outer: input should be equal to itself',
  );
  t.false(
    w2.isChanged(p1.x, { y: 1 }),
    'outer: input should be equal to its copy',
  );
  t.true(
    w2.isChanged(p1.x, { y: 2 }),
    'outer: value different from input should be detected',
  );

  w1.freeze();

  t.false(w1.isChanged(input, input), 'inner: input should be equal to itself');
  t.false(
    w1.isChanged(input, { ...input, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.false(
    w1.isChanged(input, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing deeply accessed subojects should not cause invalidation',
  );
  t.true(
    w1.isChanged(input, {
      x: {
        y: 2,
      },
      z: 3,
    }),
    'replacing deeply accessed property should cause invalidation',
  );
});

test('comparing arrays', (t) => {
  const input: Array<{ x: number; y?: number }> = [{ x: 1 }, { x: 2 }];
  const { proxy, watcher } = wrap(input);
  const derived = watcher.unwrap({
    x: proxy[1]?.x,
  });
  watcher.freeze();

  t.is(derived.x, 2);

  t.false(watcher.isChanged(input, input), 'same input');
  t.false(
    watcher.isChanged(input, [{ x: 3 }, { x: 2 }]),
    'same property at [1]',
  );
  t.false(
    watcher.isChanged(input, [{ x: 3 }, { x: 2, y: 3 }]),
    'extra property at [1]',
  );
  t.true(
    watcher.isChanged(input, [{ x: 3 }, { x: 3 }]),
    'different property at [1]',
  );
  t.true(watcher.isChanged(input, [{ x: 3 }]), 'different length');
});

test('accessing own keys', (t) => {
  const input: Partial<{
    a: number;
    b: number;
    c: number;
  }> = {
    a: 1,
    b: 2,
  };

  const { proxy, watcher } = wrap(input);
  const derived = watcher.unwrap({
    keys: Reflect.ownKeys(proxy).sort(),
  });
  watcher.freeze();

  t.deepEqual(derived.keys, ['a', 'b']);

  t.false(watcher.isChanged(input, input), 'input should be equal to itself');
  t.false(
    watcher.isChanged(input, { a: 2, b: 3 }),
    'changed values should not trigger invalidation',
  );

  const cInProto = new (class X {
    a = 1;
    b = 1;

    public get c() {
      return 2;
    }
  })();
  t.false(
    watcher.isChanged(input, cInProto),
    'different prototype keys should not trigger invalidation',
  );

  t.true(
    watcher.isChanged(input, { a: 1, b: 2, c: 3 }),
    'added keys should trigger invalidation',
  );
  t.true(
    watcher.isChanged(input, { a: 1 }),
    'removed keys should trigger invalidation',
  );
  t.true(
    watcher.isChanged(input, { b: 2, c: 3 }),
    'different keys should trigger invalidation',
  );

  const bInProto = new (class X {
    a = 1;

    public get b() {
      return 2;
    }

    c = 1;
  })();
  t.true(
    watcher.isChanged(input, bInProto),
    'missing own keys present in prototype should trigger invalidation',
  );
});

test('comparing untracked primitives', (t) => {
  const { watcher } = wrap({});
  watcher.freeze();

  t.false(watcher.isChanged(true, true));
  t.true(watcher.isChanged(true, false));
  t.false(watcher.isChanged(null, null));
  t.true(watcher.isChanged(null, { a: 1 }));
});

test('comparing untracked objects', (t) => {
  const { watcher } = wrap({});
  watcher.freeze();

  t.false(watcher.isChanged({}, {}));

  const same = {};
  t.false(watcher.isChanged(same, same));
});

test('it supports "in"', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  const { proxy, watcher } = wrap(input);

  const derived = watcher.unwrap({
    hasA: 'a' in proxy ? true : undefined,
  });

  t.true(derived.hasA);

  t.false(watcher.isChanged(input, { a: 1 }), 'copied input is the same');
  t.false(
    watcher.isChanged(input, { a: 1, b: 2 }),
    'new properties are ignored',
  );
  t.true(
    watcher.isChanged(input, { a: 2 }),
    'changed property is not ignored',
  );
});

test('own property descriptor access', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  const { proxy, watcher } = wrap(input);

  const derived = watcher.unwrap({
    hasA: Object.hasOwn(proxy, 'a'),
    hasB: Object.hasOwn(proxy, 'b'),
    a: proxy.a,
  });

  t.true(derived.hasA);
  t.false(derived.hasB);
  t.is(derived.a, input.a);

  t.false(watcher.isChanged(input, input), 'self comparison returns true');
  t.false(watcher.isChanged(input, { a: 1 }), 'same own property');

  t.true(watcher.isChanged(input, { a: 2 }), 'different own property');
  const aInProto = new (class X {
    public get a() {
      return 1;
    }

    b = 2;
  })();
  t.true(watcher.isChanged(input, aInProto), 'not own property anymore');
  t.true(
    watcher.isChanged(input, { a: 1, b: 2 }),
    'old property not in proto',
  );
});

test('wrapAll', (t) => {
  const a = { x: 1 };
  const b = { x: 1 };
  const c = { x: 1 };

  const { proxies, watcher } = wrapAll([a, b, c]);

  const derived = watcher.unwrap({
    a: proxies[0]?.x,
    b: proxies[1]?.x,
  });
  watcher.freeze();

  t.is(derived.a, a.x);
  t.is(derived.b, b.x);

  t.false(watcher.isChanged(a, { x: 1 }), 'copy of first object');
  t.false(watcher.isChanged(b, { x: 1 }), 'copy of second object');
  t.false(watcher.isChanged(c, { x: 1 }), 'copy of third object');
  t.false(watcher.isChanged(c, { x: 2 }), 'changed third object');

  t.true(watcher.isChanged(a, { x: 2 }), 'changed first object');
  t.true(watcher.isChanged(b, { x: 2 }), 'changed second object');
});

test('disallowed updates', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  t.throws(() => (wrap(input).proxy.a = 1));
  t.throws(() => delete wrap(input).proxy.a);
  t.throws(() => Object.defineProperty(wrap(input).proxy, 'a', {}));
});

test('revoked proxies', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  const { proxy, watcher } = wrap(input);
  watcher.freeze();

  t.throws(() => proxy.a);
});
