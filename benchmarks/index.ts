import { watch, memoize } from '../src';

type BenchOptions = Readonly<{
  name: string;
  iterations?: number;
  run(): number;
}>;

function bench({ name, iterations = 1000000, run }: BenchOptions): void {
  const start = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < iterations; i++) {
    acc += run();
  }
  const duration = process.hrtime.bigint() - start;

  if (acc === 0) {
    throw new Error('No side-effect');
  }

  const durationInSeconds = Number(duration) / 1e9;
  const ops = iterations / durationInSeconds;
  console.log(`${name}: ${ops.toFixed(3)} operations/second`);
}

bench({
  name: 'watch+unwrap',
  run() {
    const { proxy, watcher } = watch({ a: { b: [10, 20, 30] }, c: {} });
    const derived = watcher.unwrap({ num: proxy.a.b[2], c: proxy.c });
    watcher.stop();

    return derived.c ? derived.num ?? 0 : 0;
  },
});

{
  const input = { a: { b: [10, 20, 30] } };
  const { proxy, watcher } = watch(input);
  watcher.unwrap({ c: proxy.a.b[2] });
  watcher.stop();

  bench({
    name: 'isChanged',
    run() {
      const notChanged = !watcher.isChanged(input, { a: { b: [30, 40, 30] } });

      const changed = watcher.isChanged(input, { a: { b: [30, 40, 50] } });

      return notChanged && changed ? 1 : 0;
    },
  });
}

{
  type DeepInput = {
    a: {
      b: {
        c: Array<number>;
      };
    };
  };
  const fn = memoize((first: DeepInput, second: DeepInput): number => {
    return (first.a.b.c[1] ?? 0) + (second.a.b.c[0] ?? 0);
  });

  const input: DeepInput = { a: { b: { c: [10, 20, 30] } } };

  bench({
    name: 'memoize',
    run() {
      return fn(input, {
        a: { b: { c: [30, 40, 50] } },
      });
    },
  });
}
