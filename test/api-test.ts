import test from 'ava';

import { wrap } from '../src';

test('placing sub-property object into wrapped result', (t) => {
  const input = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const { proxy, changelog } = wrap(input);

  const derived = changelog.unwrap({
    y: proxy.x.y,
  });
  changelog.freeze();

  t.is(derived.y, input.x.y);

  t.false(changelog.isChanged(input, input), 'input should be equal to itself');
  t.false(
    changelog.isChanged(input, { ...input, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.false(
    changelog.isChanged(input, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing deeply accessed subojects should not cause invalidation',
  );
  t.true(
    changelog.isChanged(input, {
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

  const { proxy, changelog } = wrap(input);

  const derived = changelog.unwrap({
    x: proxy.x,
    y: proxy.x.y,
  });
  changelog.freeze();

  t.is(derived.x, input.x);
  t.is(derived.y, input.x.y);

  t.false(changelog.isChanged(input, input), 'input should be equal to itself');
  t.false(
    changelog.isChanged(input, { ...input, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.true(
    changelog.isChanged(input, {
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

  const { proxy: p1, changelog: c1 } = wrap(input);
  const { proxy: p2, changelog: c2 } = wrap(p1.x);

  const derived = c1.unwrap({
    y: c2.unwrap(p2.y),
  });
  t.is(derived.y, 1);

  c2.freeze();

  t.false(c2.isChanged(p1.x, p1.x), 'outer: proxy should be equal to itself');
  t.false(
    c2.isChanged(p1.x, { y: 1 }),
    'outer: proxy should be equal to its copy',
  );
  t.true(
    c2.isChanged(p1.x, { y: 2 }),
    'outer: value different from proxy should be detected',
  );

  t.false(
    c2.isChanged(input.x, input.x),
    'outer: input should be equal to itself',
  );
  t.false(
    c2.isChanged(input.x, { y: 1 }),
    'outer: input should be equal to its copy',
  );
  t.true(
    c2.isChanged(input.x, { y: 2 }),
    'outer: value different from input should be detected',
  );

  c1.freeze();

  t.false(c1.isChanged(input, input), 'inner: input should be equal to itself');
  t.false(
    c1.isChanged(input, { ...input, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.false(
    c1.isChanged(input, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing deeply accessed subojects should not cause invalidation',
  );
  t.true(
    c1.isChanged(input, {
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
  const { proxy, changelog } = wrap(input);
  const derived = changelog.unwrap({
    x: proxy[1]?.x,
  });
  changelog.freeze();

  t.is(derived.x, 2);

  t.false(changelog.isChanged(input, input), 'same input');
  t.false(
    changelog.isChanged(input, [{ x: 3 }, { x: 2 }]),
    'same property at [1]',
  );
  t.false(
    changelog.isChanged(input, [{ x: 3 }, { x: 2, y: 3 }]),
    'extra property at [1]',
  );
  t.true(
    changelog.isChanged(input, [{ x: 3 }, { x: 3 }]),
    'different property at [1]',
  );
  t.true(changelog.isChanged(input, [{ x: 3 }]), 'different length');
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

  const { proxy, changelog } = wrap(input);
  const derived = changelog.unwrap({
    keys: Reflect.ownKeys(proxy).sort(),
  });
  changelog.freeze();

  t.deepEqual(derived.keys, ['a', 'b']);

  t.false(changelog.isChanged(input, input), 'input should be equal to itself');
  t.false(
    changelog.isChanged(input, { a: 2, b: 3 }),
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
    changelog.isChanged(input, cInProto),
    'different prototype keys should not trigger invalidation',
  );

  t.true(
    changelog.isChanged(input, { a: 1, b: 2, c: 3 }),
    'added keys should trigger invalidation',
  );
  t.true(
    changelog.isChanged(input, { a: 1 }),
    'removed keys should trigger invalidation',
  );
  t.true(
    changelog.isChanged(input, { b: 2, c: 3 }),
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
    changelog.isChanged(input, bInProto),
    'missing own keys present in prototype should trigger invalidation',
  );
});

test('comparing untracked primitives', (t) => {
  const { changelog } = wrap({});
  changelog.freeze();

  t.false(changelog.isChanged(true, true));
  t.true(changelog.isChanged(true, false));
  t.false(changelog.isChanged(null, null));
  t.true(changelog.isChanged(null, { a: 1 }));
});

test('comparing untracked objects', (t) => {
  const { changelog } = wrap({});
  changelog.freeze();

  t.false(changelog.isChanged({}, {}));

  const same = {};
  t.false(changelog.isChanged(same, same));
});

test('it supports "in"', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  const { proxy, changelog } = wrap(input);

  const derived = changelog.unwrap({
    hasA: 'a' in proxy ? true : undefined,
  });

  t.true(derived.hasA);

  t.false(changelog.isChanged(input, { a: 1 }), 'copied input is the same');
  t.false(
    changelog.isChanged(input, { a: 1, b: 2 }),
    'new properties are ignored',
  );
  t.true(
    changelog.isChanged(input, { a: 2 }),
    'changed property is not ignored',
  );
});

test('own property descriptor access', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  const { proxy, changelog } = wrap(input);

  const derived = changelog.unwrap({
    hasA: Object.hasOwn(proxy, 'a'),
    hasB: Object.hasOwn(proxy, 'b'),
    a: proxy.a,
  });

  t.true(derived.hasA);
  t.false(derived.hasB);
  t.is(derived.a, input.a);

  t.false(changelog.isChanged(input, input), 'self comparison returns true');
  t.false(changelog.isChanged(input, { a: 1 }), 'same own property');

  t.true(changelog.isChanged(input, { a: 2 }), 'different own property');
  const aInProto = new (class X {
    public get a() {
      return 1;
    }

    b = 2;
  })();
  t.true(changelog.isChanged(input, aInProto), 'not own property anymore');
  t.true(
    changelog.isChanged(input, { a: 1, b: 2 }),
    'old property not in proto',
  );
});

test('disallowed updates', (t) => {
  const input: Partial<{ a: number; b: number }> = { a: 1 };

  t.throws(() => (wrap(input).proxy.a = 1));
  t.throws(() => delete wrap(input).proxy.a);
  t.throws(() => Object.defineProperty(wrap(input).proxy, 'a', {}));
});
