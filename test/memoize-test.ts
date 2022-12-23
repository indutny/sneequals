import test from 'ava';

import { memoize, type MemoizeStats } from '../src';

test('memoizing non-objects', (t) => {
  const stats: MemoizeStats = { hits: 0, misses: 0 };
  const fn = memoize((a: number, b: number): number => a + b, stats);

  t.is(fn(1, 2), 3, 'cold cache');
  t.deepEqual(stats, { hits: 0, misses: 1 });

  t.is(fn(1, 2), 3, 'cache hit');
  t.deepEqual(stats, { hits: 1, misses: 1 });

  t.is(fn(1, 3), 4, 'cache miss');
  t.deepEqual(stats, { hits: 1, misses: 2 });
});

test('memoizing objects', (t) => {
  type Input = Partial<{
    x: number | undefined;
    y: number | undefined;
  }>;
  const stats: MemoizeStats = { hits: 0, misses: 0 };
  const fn = memoize(
    (a: Input, b: Input): Input => ({
      x: a.x,
      y: b.y,
    }),
    stats,
  );

  const first = { x: 1 };

  t.deepEqual(fn(first, { y: 2 }), { x: 1, y: 2 }, 'cache miss');
  t.deepEqual(stats, { hits: 0, misses: 1 });

  t.deepEqual(
    fn({ x: 1, y: -1 }, { x: -1, y: 2 }),
    { x: 1, y: 2 },
    'global cache hit',
  );
  t.deepEqual(stats, { hits: 1, misses: 1 });

  t.deepEqual(fn(first, { y: 2 }), { x: 1, y: 2 }, 'keyed cache hit');
  t.deepEqual(stats, { hits: 2, misses: 1 });

  t.deepEqual(fn({ x: 2 }, { y: 2 }), { x: 2, y: 2 }, 'cache miss');
  t.deepEqual(stats, { hits: 2, misses: 2 });

  t.deepEqual(fn(first, { y: 1 }), { x: 1, y: 1 }, 'keyed cache miss');
  t.deepEqual(stats, { hits: 2, misses: 3 });
});

test('unused params', (t) => {
  type Input = Partial<{
    x: number | undefined;
    y: number | undefined;
  }>;
  const stats: MemoizeStats = { hits: 0, misses: 0 };
  const fn = memoize(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (a: Input, _: Input): Input => ({
      x: a.x,
      y: a.y,
    }),
    stats,
  );

  t.deepEqual(fn({ x: 1, y: 2 }, { y: 3 }), { x: 1, y: 2 }, 'cache miss');
  t.deepEqual(stats, { hits: 0, misses: 1 });

  t.deepEqual(fn({ x: 1, y: 2 }, { y: 4 }), { x: 1, y: 2 }, 'cache hit');
  t.deepEqual(stats, { hits: 1, misses: 1 });

  t.deepEqual(fn({ x: 1, y: 3 }, { y: 4 }), { x: 1, y: 3 }, 'cache miss');
  t.deepEqual(stats, { hits: 1, misses: 2 });
});
