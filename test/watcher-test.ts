import test from 'ava';

import { watch, watchAll, getAffectedPaths } from '../src';

test('placing sub-property object into wrapped result', (t) => {
  const input = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const { proxy, watcher } = watch(input);

  const derived = watcher.unwrap({
    y: proxy.x.y,
  });
  watcher.stop();

  t.is(derived.y, input.x.y);
  t.deepEqual(getAffectedPaths(watcher, input), ['$.x.y']);

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

  const { proxy, watcher } = watch(input);

  const derived = watcher.unwrap({
    x: proxy.x,
    y: proxy.x.y,
  });

  // Touch nested property after unwrap to make sure that the `proxy.x` stays
  // in `kSelf` terminal mode.
  t.is(proxy.x.y, 1);

  watcher.stop();

  t.is(derived.x, input.x);
  t.is(derived.y, input.x.y);
  t.deepEqual(getAffectedPaths(watcher, input), ['$.x']);

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

  const { proxy: p1, watcher: w1 } = watch(input);
  const { proxy: p2, watcher: w2 } = watch(p1.x);

  const derived = w1.unwrap({
    y: w2.unwrap(p2.y),
  });

  w2.stop();

  t.is(derived.y, 1);
  t.deepEqual(getAffectedPaths(w1, input), ['$.x.y']);

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

  w1.stop();

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

test('nested wraps with self use', (t) => {
  const input = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const { proxy: p1, watcher: w1 } = watch(input);
  const { proxy: p2, watcher: w2 } = watch(p1.x);

  const derived = w1.unwrap({
    x: w2.unwrap(p2),
  });

  w2.stop();
  w1.stop();

  t.is(derived.x.y, 1);
  t.deepEqual(getAffectedPaths(w1, input), ['$.x']);
  t.deepEqual(getAffectedPaths(w2, input.x), ['$']);

  t.false(
    w2.isChanged(input.x, input.x),
    'outer: proxy should be equal to itself',
  );
  t.true(
    w2.isChanged(input.x, { y: 1 }),
    'outer: proxy should not be equal to its copy',
  );

  t.false(w1.isChanged(input, input), 'inner: input should be equal to itself');
  t.false(
    w1.isChanged(input, { ...input, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.true(
    w1.isChanged(input, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing deeply accessed object should cause invalidation',
  );
});

test('nested wraps with non-configurable properties', (t) => {
  const input = [1, 2, 3];
  const { proxy: p1, watcher: w1 } = watch(input);
  const { proxy: p2, watcher: w2 } = watch(p1);

  const derived = w1.unwrap(w2.unwrap(p2.filter((x) => x > 1)));

  w2.stop();
  w1.stop();

  t.deepEqual(derived, [2, 3]);

  const affected = [
    '$:has(0)',
    '$:has(1)',
    '$:has(2)',
    '$.filter',
    '$.length',
    '$.constructor',
    '$.0',
    '$.1',
    '$.2',
  ];
  t.deepEqual(getAffectedPaths(w1, input), affected);
  t.deepEqual(getAffectedPaths(w2, input), affected);
});

test('comparing arrays', (t) => {
  const input: Array<{ x: number; y?: number }> = [{ x: 1 }, { x: 2 }];
  const { proxy, watcher } = watch(input);
  const derived = watcher.unwrap({
    x: proxy[1]?.x,
  });
  watcher.stop();

  t.is(derived.x, 2);
  t.deepEqual(getAffectedPaths(watcher, input), ['$.1.x']);

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

  const { proxy, watcher } = watch(input);
  const derived = watcher.unwrap({
    // This should not contribute to affected paths
    hasA: Object.hasOwn(proxy, 'a'),

    keys: Reflect.ownKeys(proxy).sort(),

    // This should not contribute to affected paths
    hasB: Object.hasOwn(proxy, 'a'),
  });
  watcher.stop();

  t.true(derived.hasA);
  t.deepEqual(derived.keys, ['a', 'b']);
  t.true(derived.hasB);
  t.deepEqual(getAffectedPaths(watcher, input), ['$:allOwnKeys']);

  t.false(watcher.isChanged(input, input), 'input should be equal to itself');
  t.false(
    watcher.isChanged(input, { a: 2, b: 3 }),
    'changed values should not trigger invalidation',
  );

  const cInProto = new (class {
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

  const bInProto = new (class {
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

test('skip tracking of non-objects/non-arrays', (t) => {
  const input = {
    a: new Map([['b', 1]]),
    c: new (class {
      d = 2;
    })(),
  };
  const { proxy, watcher } = watch(input);
  const derived = watcher.unwrap({
    b: proxy.a.get('b'),
    d: proxy.c.d,
  });
  watcher.stop();

  t.is(derived.b, 1);
  t.is(derived.d, 2);
  t.deepEqual(getAffectedPaths(watcher, input), []);
});

test('comparing untracked primitives', (t) => {
  const { watcher } = watch({});
  watcher.stop();
  t.deepEqual(getAffectedPaths(watcher, true), []);
  t.deepEqual(getAffectedPaths(watcher, null), []);

  t.false(watcher.isChanged(true, true));
  t.true(watcher.isChanged(true, false));
  t.false(watcher.isChanged(null, null));
  t.true(watcher.isChanged(null, { a: 1 }));
});

test('comparing untracked objects', (t) => {
  const { watcher } = watch({});
  watcher.stop();

  t.false(watcher.isChanged({}, {}));
  t.deepEqual(getAffectedPaths(watcher, {}), []);

  const same = {};
  t.false(watcher.isChanged(same, same));
});

test('it supports "in"', (t) => {
  const input: Partial<{ a: number; b: number; c: number }> = { a: 1 };

  const { proxy, watcher } = watch(input);

  const derived = watcher.unwrap({
    hasA: 'a' in proxy,
    hasB: 'b' in proxy,
  });

  watcher.stop();

  t.true(derived.hasA);
  t.false(derived.hasB);
  t.deepEqual(getAffectedPaths(watcher, input), ['$:has(a)', '$:has(b)']);

  t.false(watcher.isChanged(input, { a: 1 }), 'copied input has the key');
  t.false(watcher.isChanged(input, { a: 2 }), 'different value is ignored');
  t.false(
    watcher.isChanged(input, { a: 1, c: 3 }),
    'new properties are ignored',
  );
  t.true(watcher.isChanged(input, {}), 'missing property is not ignored');
  t.true(
    watcher.isChanged(input, { a: 1, b: 1 }),
    'added property is not ignored',
  );
});

test('own property descriptor access', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  const { proxy, watcher } = watch(input);

  const derived = watcher.unwrap({
    hasA: Object.hasOwn(proxy, 'a'),
    hasB: Object.hasOwn(proxy, 'b'),
    a: proxy.a,
  });
  watcher.stop();

  t.true(derived.hasA);
  t.false(derived.hasB);
  t.is(derived.a, input.a);
  t.deepEqual(getAffectedPaths(watcher, input), [
    '$:hasOwn(a)',
    '$:hasOwn(b)',
    '$.a',
  ]);

  t.false(watcher.isChanged(input, input), 'self comparison returns true');
  t.false(watcher.isChanged(input, { a: 1 }), 'same own property');

  t.true(watcher.isChanged(input, { a: 2 }), 'different own property');
  const aInProto = new (class {
    public get a() {
      return 1;
    }

    b = 2;
  })();
  t.true(watcher.isChanged(input, aInProto), 'not own property anymore');
  t.true(watcher.isChanged(input, { a: 1, b: 2 }), 'old property not in proto');
});

test('frozen objects', (t) => {
  const input = Object.freeze({
    a: Object.freeze([1]),
  });

  for (const prefix of ['fresh', 'cached']) {
    const { proxy, watcher } = watch(input);

    const derived = watcher.unwrap({
      b: proxy.a[0],
    });
    watcher.stop();

    t.is(derived.b, input.a[0]);
    t.deepEqual(getAffectedPaths(watcher, input), ['$.a.0']);

    t.false(
      watcher.isChanged(input, input),
      `${prefix}: self comparison returns true`,
    );
    t.false(
      watcher.isChanged(input, { a: [1, 2] }),
      `${prefix}: same deep property`,
    );

    t.true(
      watcher.isChanged(input, { a: [2] }),
      `${prefix}: different deep property`,
    );
  }
});

test('wrapAll', (t) => {
  const a = { x: 1 };
  const b = { x: 1 };
  const c = { x: 1 };

  const { proxies, watcher } = watchAll([a, b, c]);

  const derived = watcher.unwrap({
    a: proxies[0]?.x,
    b: proxies[1]?.x,
  });
  watcher.stop();

  t.is(derived.a, a.x);
  t.is(derived.b, b.x);
  t.deepEqual(getAffectedPaths(watcher, a), ['$.x']);
  t.deepEqual(getAffectedPaths(watcher, b), ['$.x']);
  t.deepEqual(getAffectedPaths(watcher, c), []);

  t.false(watcher.isChanged(a, { x: 1 }), 'copy of first object');
  t.false(watcher.isChanged(b, { x: 1 }), 'copy of second object');
  t.false(watcher.isChanged(c, { x: 1 }), 'copy of third object');
  t.false(watcher.isChanged(c, { x: 2 }), 'changed third object');

  t.true(watcher.isChanged(a, { x: 2 }), 'changed first object');
  t.true(watcher.isChanged(b, { x: 2 }), 'changed second object');
});

test('unwrapping the proxy itself', (t) => {
  const input = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const { proxy, watcher } = watch(input);

  const derived = watcher.unwrap(proxy);
  watcher.stop();

  t.is(derived, input);

  t.deepEqual(getAffectedPaths(watcher, input), ['$']);

  t.false(watcher.isChanged(input, input), 'input should be equal to itself');
  t.true(
    watcher.isChanged(input, { ...input }),
    'copied input should be not be equal',
  );
});

test('circular object', (t) => {
  type Circular<Value> = {
    self?: Circular<Value>;
    value: Value;
  };

  const input = { a: { b: 1 } };
  const { proxy, watcher } = watch(input);

  const circular: Circular<typeof proxy.a> = {
    value: proxy.a,
  };
  circular.self = circular;

  const derived = watcher.unwrap(circular);
  watcher.stop();

  t.is(derived.self, derived);
  t.is(derived.value, input.a);
});

test('disallowed updates', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  t.throws(() => (watch(input).proxy.a = 1));
  t.throws(() => delete watch(input).proxy.a);
  t.throws(() => Object.defineProperty(watch(input).proxy, 'a', {}));
});

test('revoked proxies', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  const { proxy, watcher } = watch(input);
  watcher.stop();

  t.throws(() => proxy.a);
});

test('getAffectedPaths ignores non-Watcher instances', (t) => {
  const notWatcher = {
    unwrap<Result>(result: Result): Result {
      return result;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    stop() {},
    isChanged() {
      return false;
    },
  };
  t.deepEqual(getAffectedPaths(notWatcher, {}), []);
});
