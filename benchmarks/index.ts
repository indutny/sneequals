import { watch, memoize } from '../src';

type BenchOptions = Readonly<{
  name: string;
  baseIterations?: number;
  sampleCount?: number;
  sweepWidth?: number;
  run(): number;
}>;

type Sample = Readonly<{
  value: number;
  iterations: number;
}>;

type Regression = Readonly<{
  alpha: number;
  beta: number;
  c99: number;
  usedSamples: number;
}>;

// The benchmark method is loosely inspired by:
// https://github.com/bheisler/criterion.rs/blob/27642b476837753cbb539f269fbbcbefa815bf00/book/src/analysis.md
function linearRegression(samples: ReadonlyArray<Sample>): Regression {
  const bins = new Map<number, Array<number>>();

  for (const { iterations, value } of samples) {
    let bin = bins.get(iterations);
    if (bin === undefined) {
      bin = [];
      bins.set(iterations, bin);
    }
    bin.push(value);
  }

  const withoutOutliers = new Array<Sample>();
  for (const [iterations, values] of bins) {
    values.sort();

    const p25 = values[Math.floor(values.length * 0.25)] ?? -Infinity;
    const p75 = values[Math.ceil(values.length * 0.75)] ?? +Infinity;
    const iqr = p75 - p25;
    const outlierLow = p25 - iqr * 1.5;
    const outlierHigh = p75 + iqr * 1.5;

    // Tukey's method
    const filtered = values.filter((s) => s >= outlierLow && s <= outlierHigh);

    for (const value of filtered) {
      withoutOutliers.push({ iterations, value });
    }
  }

  if (withoutOutliers.length < 2) {
    throw new Error('Low sample count');
  }

  let meanValue = 0;
  let meanIterations = 0;
  for (const { value, iterations } of withoutOutliers) {
    meanValue += value;
    meanIterations += iterations;
  }
  meanValue /= withoutOutliers.length;
  meanIterations /= withoutOutliers.length;

  let betaNum = 0;
  let betaDenom = 0;
  for (const { value, iterations } of withoutOutliers) {
    betaNum += (value - meanValue) * (iterations - meanIterations);
    betaDenom += (iterations - meanIterations) ** 2;
  }

  // Slope
  const beta = betaNum / betaDenom;

  // Intercept
  const alpha = meanValue - beta * meanIterations;

  let stdError = 0;
  for (const { value, iterations } of withoutOutliers) {
    stdError += (value - alpha - beta * iterations) ** 2;
  }
  stdError /= withoutOutliers.length - 2;
  stdError /= betaDenom;
  stdError = Math.sqrt(stdError);

  const T_VALUE = 2.32635; // t-distribution value for large sample count

  return {
    alpha,
    beta,
    c99: T_VALUE * stdError,
    usedSamples: withoutOutliers.length,
  };
}

function bench({
  name,
  baseIterations = 10000,
  sampleCount = 250,
  sweepWidth = 10,
  run,
}: BenchOptions): void {
  const samples = new Array<Sample>();

  // Warm-up
  for (let i = 0; i < baseIterations; i++) {
    run();
  }

  for (let i = 0; i < sampleCount; i++) {
    const iterations = baseIterations * ((i % sweepWidth) + 1);

    const start = process.hrtime.bigint();
    let acc = 0;
    for (let i = 0; i < iterations; i++) {
      acc += run();
    }
    const duration = process.hrtime.bigint() - start;
    const durationInSeconds = Number(duration) / 1e9;

    if (acc === 0) {
      throw new Error('No side-effect');
    }

    samples.push({ value: durationInSeconds, iterations });
  }

  const { beta, c99, usedSamples } = linearRegression(samples);
  const ops = 1 / beta;
  const lowOps = 1 / (beta + c99);
  const highOps = 1 / (beta - c99);
  const maxError = Math.max(highOps - ops, ops - lowOps);

  console.log(
    `${name}: ${ops.toFixed(1)} ` +
      `(±${maxError.toFixed(1)}, n=${usedSamples}, p=0.01) operations/second`,
  );
}

bench({
  name: 'watch+unwrap',
  baseIterations: 5000,
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
