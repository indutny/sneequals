import test from 'ava';

import { SneakyEquals } from '../src';

test('it supports "in"', (t) => {
  const o: Partial<{ a: number; b: number }> = { a: 1 };

  const s = new SneakyEquals();

  const p = s.track(o);

  const result = s.unwrap({
    has: 'a' in p ? true : undefined,
  });

  t.true(result.has);

  t.true(s.isEqual(o, { a: 1 }), 'copied object is the same');
  t.true(s.isEqual(o, { a: 1, b: 2 }), 'new properties are ignored');
  t.false(s.isEqual(o, { a: 2 }), 'changed property is not ignored');
});

test('it deoptimizes on "hasOwnProperty"', (t) => {
  const o: Partial<{ a: number; b: number }> = { a: 1 };

  const s = new SneakyEquals();

  const p = s.track(o);

  const result = s.unwrap({
    has: Object.prototype.hasOwnProperty.call(p, 'a'),
    a: p.a,
  });

  t.true(result.has);
  t.is(result.a, o.a);

  t.true(s.isEqual(o, o), 'self comparison returns true');
  t.false(s.isEqual(o, { a: 1 }), 'copied object is not the same');
});

test('it throws on updates', (t) => {
  const o: Partial<{ a: number; b: number }> = { a: 1 };

  const s = new SneakyEquals();

  const p = s.track(o);

  t.throws(() => (p.a = 1));
  t.throws(() => delete p.a);
  t.throws(() => Object.defineProperty(p, 'a', {}));
});

test('returning sub-property object without accessing it', (t) => {
  const o = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const s = new SneakyEquals();

  const p = s.track(o);

  const result = s.unwrap({
    y: p.x.y,
  });

  t.is(result.y, o.x.y);
  t.true(s.wasTouched(o), 'object was touched');
  t.true(s.wasTouched(o.x), 'object.x was touched');
  t.false(s.wasTouched(o.z), 'object.z was not touched');

  t.true(s.isEqual(o, o), 'object should be equal to itself');
  t.true(
    s.isEqual(o, { ...o, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.true(
    s.isEqual(o, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing deeply accessed subojects should not cause invalidation',
  );
});

test('returning sub-property object while accessing it', (t) => {
  const o = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const s = new SneakyEquals();

  const p = s.track(o);

  const result = s.unwrap({
    x: p.x,
    y: p.x.y,
  });

  t.is(result.x, o.x);
  t.is(result.y, o.x.y);

  t.true(s.isEqual(o, o), 'object should be equal to itself');
  t.true(
    s.isEqual(o, { ...o, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.false(
    s.isEqual(o, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing fully-copied subojects should cause invalidation',
  );
});

test('comparing arrays', (t) => {
  const s = new SneakyEquals();

  const arr = [{ x: 1 }, { x: 2 }];
  const p = s.track(arr);

  const derived = s.unwrap({
    x: p[1]?.x,
  });

  t.is(derived.x, 2);

  t.true(s.wasTouched(arr), 'was touched');
  t.false(s.wasTouched(arr[0]), "[0] wasn't touched");
  t.true(s.wasTouched(arr[1]), '[1] was touched');

  t.true(s.isEqual(arr, arr), 'same array');
  t.true(s.isEqual(arr, [{ x: 3 }, { x: 2 }]), 'same property');
  t.false(s.isEqual(arr, [{ x: 3 }, { x: 3 }]), 'different property');
  t.false(s.isEqual(arr, [{ x: 3 }]), 'different length');
});

test('accessing ownKeys', (t) => {
  const o: Partial<{
    a: number;
    b: number;
    c: number;
  }> = {
    a: 1,
    b: 2,
  };

  const s = new SneakyEquals();

  const p = s.track(o);

  const result = s.unwrap({
    keys: Reflect.ownKeys(p).sort(),
  });

  t.deepEqual(result.keys, ['a', 'b']);

  t.true(s.isEqual(o, o), 'object should be equal to itself');
  t.false(
    s.isEqual(o, { a: 1, b: 2, c: 3 }),
    'added keys should trigger invalidation',
  );
  t.false(s.isEqual(o, { a: 1 }), 'removed keys should trigger invalidation');
  t.false(
    s.isEqual(o, { b: 2, c: 3 }),
    'different keys should trigger invalidation',
  );
  t.true(
    s.isEqual(o, { a: 2, b: 3 }),
    'changed values should not trigger invalidation',
  );
});

test('comparing primitives', (t) => {
  const s = new SneakyEquals();

  t.true(s.isEqual(true, true));
  t.false(s.isEqual(true, false));
  t.true(s.isEqual(null, null));
  t.false(s.isEqual(null, { a: 1 }));
});

test('comparing untracked objects', (t) => {
  const s = new SneakyEquals();

  t.false(s.isEqual({}, {}));

  const o = {};
  t.true(s.isEqual(o, o));
});
