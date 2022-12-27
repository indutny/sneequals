# @indutny/sneequals

[![npm](https://img.shields.io/npm/v/@indutny/sneequals)](https://www.npmjs.com/package/@indutny/sneequals)
[![size](https://img.shields.io/bundlephobia/minzip/@indutny/sneequals)](https://bundlephobia.com/result?p=@indutny/sneequals)
![CI Status](https://github.com/indutny/sneequals/actions/workflows/test.yml/badge.svg)

[API docs](https://indutny.github.io/sneequals).

Sneaky equals comparison between objects that checks only the properties that
were touched.

Heavily inspired by [proxy-compare](https://github.com/dai-shi/proxy-compare).

## Installation

```sh
npm install @indutny/sneequals
```

## Usage

### One object comparison

```js
import { watch } from '@indutny/sneequals';

const originalData = {
  nested: {
    prop: 1,
  },
  avatar: {
    src: 'image.png',
  },
};

const { proxy, watcher } = watch(originalData);

function doSomethingWithData(data) {
  return {
    prop: data.nested.prop,
    x: data.avatar,
  };
}

const result = watcher.unwrap(doSomethingWithData(proxy));

// Prevent further access to proxy
watcher.stop();

const sneakyEqualData = {
  nested: {
    prop: 1,
    other: 'ignored',
  },
  avatar: original.avatar,
};

console.log(watcher.isChanged(originalData, sneakyEqualData)); // false

const sneakyDifferentData = {
  nested: {
    prop: 2,
  },
  avatar: {
    ...original.avatar,
  },
};

console.log(watcher.isChanged(originalData, sneakyDifferentData)); // true
```

### Multi object comparison

```js
import { watchAll } from '@indutny/sneequals';

const inputA = { a: 1 };
const inputB = { b: 2 };

const { proxies, watcher } = watchAll([inputA, inputB]);

function fn(a, b) {
  return a.a + a.b;
}

const result = watcher.unwrap(fn(...proxies));

// Prevent further access to proxies
watcher.stop();

console.log(watcher.isChanged(inputA, { a: 1 })); // false
console.log(watcher.isChanged(inputB, { b: 3 })); // true
```

### Memoization

`memoize()` is provided as a convenience API method. It has a
[reselect](https://github.com/reduxjs/reselect)-like cache semantics and
remembers only the last used parameters and returned result.

```js
import { memoize } from '@indutny/sneequals';

const fn = memoize((a, b) => {
  return a.a + a.b;
});
```

### Debug Tools

`memoize()` takes a stats interface as the second argument:

```js
import { memoize, getAffectedPaths } from '@indutny/sneequals';

const fn = memoize(
  (a, b) => {
    return a.a + a.b;
  },
  {
    onHit() {},
    onMiss(watcher, [a, b]) {
      console.log('affected paths in a', getAffectedPaths(watcher, a));
      console.log('affected paths in b', getAffectedPaths(watcher, b));
    },
  },
);
```

- `onHit()` is called on every cache hit.
- `onMiss()` is called on every cache miss, and receives a new `watcher` as the
  first argument and the list of parameters used when creating this watcher. (It
  is called after `watcher.unwrap` and `watcher.stop`).

## Benchmarks

On M1 Macbook Pro 13:

```sh
% npm run bench -- --ignore-outliers

> @indutny/sneequals@1.3.5 bench
> bencher dist/benchmarks/*.js

isChanged:    5’138’457.0 ops/sec (±129’240.4, p=0.001, o=7/100)
isNotChanged: 9’847’163.0 ops/sec (±81’090.6, p=0.001, o=3/100)
memoize:      9’021’557.5 ops/sec (±109’671.1, p=0.001, o=6/100)
watch+unwrap: 837’999.5 ops/sec (±13’528.4, p=0.001, o=1/100)
```

## Credits

- Based on [proxy-compare](https://github.com/dai-shi/proxy-compare) by
  [dai-shi](https://github.com/dai-shi)
- Name coined by [Scott Nonnenberg](https://github.com/scottnonnenberg/).

## LICENSE

This software is licensed under the MIT License.
