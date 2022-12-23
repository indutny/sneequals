import test from 'ava';

import { memoize, type MemoizeStats } from '../src';

type StatsResult = 'hit' | 'miss' | undefined;

class Stats implements MemoizeStats {
  private privResult: StatsResult;

  public onHit() {
    if (this.privResult !== undefined) {
      throw new Error('Stats not clean');
    }
    this.privResult = 'hit';
  }

  public onMiss() {
    if (this.privResult !== undefined) {
      throw new Error('Stats not clean');
    }
    this.privResult = 'miss';
  }

  public get result(): StatsResult {
    const result = this.privResult;
    this.privResult = undefined;
    return result;
  }
}

test('memoizing non-objects', (t) => {
  const stats = new Stats();
  const fn = memoize((a: number, b: number): number => a + b, stats);

  t.is(fn(1, 2), 3, 'cold cache');
  t.is(stats.result, 'miss');

  t.is(fn(1, 2), 3, 'cache hit');
  t.is(stats.result, 'hit');

  t.is(fn(1, 3), 4, 'cache miss');
  t.is(stats.result, 'miss');
});

test('memoizing objects', (t) => {
  type Input = Partial<{
    x: number | undefined;
    y: number | undefined;
  }>;
  const stats = new Stats();
  const fn = memoize(
    (a: Input, b: Input): Input => ({
      x: a.x,
      y: b.y,
    }),
    stats,
  );

  const first = { x: 1 };

  t.deepEqual(fn(first, { y: 2 }), { x: 1, y: 2 }, 'cache miss');
  t.is(stats.result, 'miss');

  t.deepEqual(
    fn({ x: 1, y: -1 }, { x: -1, y: 2 }),
    { x: 1, y: 2 },
    'global cache hit',
  );
  t.is(stats.result, 'hit');

  t.deepEqual(fn(first, { y: 2 }), { x: 1, y: 2 }, 'keyed cache hit');
  t.is(stats.result, 'hit');

  t.deepEqual(fn({ x: 2 }, { y: 2 }), { x: 2, y: 2 }, 'cache miss');
  t.is(stats.result, 'miss');

  t.deepEqual(fn(first, { y: 1 }), { x: 1, y: 1 }, 'keyed cache miss');
  t.is(stats.result, 'miss');
});

test('unused params', (t) => {
  type Input = Partial<{
    x: number | undefined;
    y: number | undefined;
  }>;
  const stats = new Stats();
  const fn = memoize(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (a: Input, _: Input): Input => ({
      x: a.x,
      y: a.y,
    }),
    stats,
  );

  t.deepEqual(fn({ x: 1, y: 2 }, { y: 3 }), { x: 1, y: 2 }, 'cache miss');
  t.is(stats.result, 'miss');

  t.deepEqual(fn({ x: 1, y: 2 }, { y: 4 }), { x: 1, y: 2 }, 'cache hit');
  t.is(stats.result, 'hit');

  t.deepEqual(fn({ x: 1, y: 3 }, { y: 4 }), { x: 1, y: 3 }, 'cache miss');
  t.is(stats.result, 'miss');
});