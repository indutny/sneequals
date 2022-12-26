import test from 'ava';

import {
  memoize,
  getAffectedPaths,
  type MemoizeStats,
  type IWatcher,
} from '../src';

type StatsResult = 'hit' | 'miss' | undefined;

class Stats<Params extends ReadonlyArray<unknown>>
  implements MemoizeStats<Params>
{
  private privResult: StatsResult;
  private paramPaths: Array<ReadonlyArray<string>> | undefined;

  public onHit(): void {
    if (this.privResult !== undefined) {
      throw new Error('Stats not clean');
    }
    this.privResult = 'hit';
  }

  public onMiss(watcher: IWatcher, params: Params): void {
    if (this.privResult !== undefined) {
      throw new Error('Stats not clean');
    }
    this.privResult = 'miss';
    this.paramPaths = params.map((param) => getAffectedPaths(watcher, param));
  }

  public get result(): StatsResult {
    const result = this.privResult;
    this.privResult = undefined;
    return result;
  }

  public getAffectedPaths(index: number): ReadonlyArray<string> | undefined {
    return this.paramPaths?.[index];
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
  t.snapshot(stats.getAffectedPaths(0), 'first parameter paths');
  t.snapshot(stats.getAffectedPaths(1), 'second parameter paths');

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
  t.snapshot(stats.getAffectedPaths(0), 'first parameter paths');
  t.snapshot(stats.getAffectedPaths(1), 'second parameter paths');

  t.deepEqual(fn({ x: 1, y: 2 }, { y: 4 }), { x: 1, y: 2 }, 'cache hit');
  t.is(stats.result, 'hit');

  t.deepEqual(fn({ x: 1, y: 3 }, { y: 4 }), { x: 1, y: 3 }, 'cache miss');
  t.is(stats.result, 'miss');
});

test('nested calls', (t) => {
  type Input = Partial<{
    x: number | undefined;
    y: number | undefined;
  }>;

  const innerStats = new Stats();
  const inner = memoize((a: Input): number | undefined => {
    return a.x;
  }, innerStats);

  const outerStats = new Stats();
  const outer = memoize(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (a: Input): number | undefined => inner(a),
    outerStats,
  );

  t.is(outer({ x: 1, y: 2 }), 1, 'cache miss');
  t.is(innerStats.result, 'miss');
  t.is(outerStats.result, 'miss');
  t.snapshot(innerStats.getAffectedPaths(0), 'first inner parameter paths');
  t.snapshot(outerStats.getAffectedPaths(0), 'first outer parameter paths');

  t.deepEqual(outer({ x: 1, y: 3 }), 1, 'cache hit');
  t.is(outerStats.result, 'hit');

  t.deepEqual(outer({ x: 2, y: 2 }), 2, 'cache miss');
  t.is(innerStats.result, 'miss');
  t.is(outerStats.result, 'miss');
});
