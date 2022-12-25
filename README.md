# @indutny/sneequals

[![npm](https://img.shields.io/npm/v/@indutny/sneequals)](https://www.npmjs.com/package/@indutny/sneequals)
[![size](https://img.shields.io/bundlephobia/minzip/@indutny/sneequals)](https://bundlephobia.com/result?p=@indutny/sneequals)
![CI Status](https://github.com/indutny/sneequals/actions/workflows/test.yml/badge.svg)

Sneaky equals comparison between objects that checks only the properties that
were touched.

Inspired by [proxy-compare](https://github.com/dai-shi/proxy-compare).

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

`memoize()` is provided as a convenience API method. It has a simple
WeakMap-based cache that keys by first object argument of the function and/or
global internal key.

```js
import { memoize } from '@indutny/sneequals';

const fn = memoize((a, b) => {
  return a.a + a.b;
});
```

## Benchmarks

On M1 Macbook Pro 13:

```sh
% npm run bench -- --ignore-outliers

> @indutny/sneequals@1.3.5 bench
> bencher dist/benchmarks/*.js

isChanged:    12’537’951.7 ops/sec (±110’841.8, p=0.001, o=0/100)
isNotChanged: 11’334’430.0 ops/sec (±89’485.8, p=0.001, o=2/100)
memoize:      4’563’277.3 ops/sec (±42’522.8, p=0.001, o=2/100)
watch+unwrap: 875’448.8 ops/sec (±13’767.5, p=0.001, o=7/100)
```

## Credits

Name coined by [Scott Nonnenberg](https://github.com/scottnonnenberg/).

## LICENSE

This software is licensed under the MIT License.
