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

## Benchmarks

On M1 Macbook Pro 13:

```sh
% npm run bench -- --ignore-outliers

> @indutny/sneequals@1.3.5 bench
> bencher dist/benchmarks/*.js

isChanged:    4’977’558.1 ops/sec (±22’452.9, p=0.001, o=8/100)
isNotChanged: 9’369’084.6 ops/sec (±52’271.6, p=0.001, o=9/100)
memoize:      9’846’658.1 ops/sec (±79’016.2, p=0.001, o=5/100)
watch+unwrap: 745’887.7 ops/sec (±10’107.6, p=0.001, o=9/100)
```

## Credits

- Based on [proxy-compare](https://github.com/dai-shi/proxy-compare) by
  [dai-shi](https://github.com/dai-shi)
- Name coined by [Scott Nonnenberg](https://github.com/scottnonnenberg/).

## LICENSE

This software is licensed under the MIT License.
