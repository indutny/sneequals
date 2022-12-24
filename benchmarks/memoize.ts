import { memoize } from '../src/';

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

export const name = 'memoize';

export default () => {
  return fn(input, {
    a: { b: { c: [30, 40, 50] } },
  });
};
