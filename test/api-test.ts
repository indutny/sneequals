import test from 'ava';

import { SneakyEquals } from '../src';

test('returning sub-property object without accessing it', (t) => {
  const o = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const s = new SneakyEquals();

  const result = s.produce(o, (o) => ({
    y: o.x.y,
  }));

  t.is(result.y, o.x.y);
  t.true(s.wasTouched(o), 'object was touched');
  t.true(s.wasTouched(o.x), 'object.x was touched');
  t.false(s.wasTouched(o.z), 'object.z was not touched');

  t.false(s.isChanged(o, o), 'object should be equal to itself');
  t.false(
    s.isChanged(o, { ...o, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.false(
    s.isChanged(o, {
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

  const result = s.produce(o, (o) => ({
    x: o.x,
    y: o.x.y,
  }));

  t.is(result.x, o.x);
  t.is(result.y, o.x.y);

  t.false(s.isChanged(o, o), 'object should be equal to itself');
  t.false(
    s.isChanged(o, { ...o, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.true(
    s.isChanged(o, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing fully-copied subojects should cause invalidation',
  );
});

test('nested producers', (t) => {
  const o = {
    x: {
      y: 1,
    },
    z: 2,
  };

  const s = new SneakyEquals();

  const result = s.produce(o, (o) => {
    return {
      y: s.produce(o.x, (x) => x.y),
    };
  });

  t.is(result.y, o.x.y);
  t.true(s.wasTouched(o), 'object was touched');
  t.true(s.wasTouched(o.x), 'object.x was touched');
  t.false(s.wasTouched(o.z), 'object.z was not touched');

  t.false(s.isChanged(o, o), 'object should be equal to itself');
  t.false(
    s.isChanged(o, { ...o, z: 3 }),
    'unrelated properties should not be taken in account',
  );
  t.false(
    s.isChanged(o, {
      x: {
        y: 1,
      },
      z: 3,
    }),
    'replacing deeply accessed subojects should not cause invalidation',
  );
});

test('comparing arrays', (t) => {
  const s = new SneakyEquals();

  const arr = [{ x: 1 }, { x: 2 }];
  const derived = s.produce(arr, (arr) => ({
    x: arr[1]?.x,
  }));

  t.is(derived.x, 2);

  t.true(s.wasTouched(arr), 'was touched');
  t.false(s.wasTouched(arr[0]), "[0] wasn't touched");
  t.true(s.wasTouched(arr[1]), '[1] was touched');

  t.false(s.isChanged(arr, arr), 'same array');
  t.false(s.isChanged(arr, [{ x: 3 }, { x: 2 }]), 'same property');
  t.true(s.isChanged(arr, [{ x: 3 }, { x: 3 }]), 'different property');
  t.true(s.isChanged(arr, [{ x: 3 }]), 'different length');
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

  const result = s.produce(o, (o) => ({
    keys: Reflect.ownKeys(o).sort(),
  }));

  t.deepEqual(result.keys, ['a', 'b']);

  t.false(s.isChanged(o, o), 'object should be equal to itself');
  t.true(
    s.isChanged(o, { a: 1, b: 2, c: 3 }),
    'added keys should trigger invalidation',
  );
  t.true(s.isChanged(o, { a: 1 }), 'removed keys should trigger invalidation');
  t.true(
    s.isChanged(o, { b: 2, c: 3 }),
    'different keys should trigger invalidation',
  );
  t.false(
    s.isChanged(o, { a: 2, b: 3 }),
    'changed values should not trigger invalidation',
  );
});

test('comparing primitives', (t) => {
  const s = new SneakyEquals();

  t.false(s.isChanged(true, true));
  t.true(s.isChanged(true, false));
  t.false(s.isChanged(null, null));
  t.true(s.isChanged(null, { a: 1 }));
});

test('comparing untracked objects', (t) => {
  const s = new SneakyEquals();

  t.false(s.isChanged({}, {}));

  const o = {};
  t.false(s.isChanged(o, o));
});

test('it supports "in"', (t) => {
  const o: Partial<{ a: number; b: number }> = { a: 1 };

  const s = new SneakyEquals();

  const result = s.produce(o, (o) => ({
    has: 'a' in o ? true : undefined,
  }));

  t.true(result.has);

  t.false(s.isChanged(o, { a: 1 }), 'copied object is the same');
  t.false(s.isChanged(o, { a: 1, b: 2 }), 'new properties are ignored');
  t.true(s.isChanged(o, { a: 2 }), 'changed property is not ignored');
});

test('it deoptimizes on "hasOwn"', (t) => {
  const o: Partial<{ a: number; b: number }> = { a: 1 };

  const s = new SneakyEquals();

  const result = s.produce(o, (o) => ({
    has: Object.hasOwn(o, 'a'),
    a: o.a,
  }));

  t.true(result.has);
  t.is(result.a, o.a);

  t.false(s.isChanged(o, o), 'self comparison returns true');
  t.true(s.isChanged(o, { a: 1 }), 'copied object is not the same');
});

test('it throws on updates', (t) => {
  const o: Partial<{ a: number; b: number }> = { a: 1 };

  const s = new SneakyEquals();

  t.throws(() => s.produce(o, (o) => (o.a = 1)));
  t.throws(() => s.produce(o, (o) => delete o.a));
  t.throws(() => s.produce(o, (o) => Object.defineProperty(o, 'a', {})));
});
