# @indutny/sneaky-equals

Sneaky equals comparison between objects that checks only the properties that
were touched.

## Installation

```sh
npm install @indutny/sneaky-equals
```

## Usage

```js
import { SneakyEquals } from '@indutny/sneaky-equals';

const s = new SneakyEquals();

const originalData = {
  nested: {
    prop: 1,
  },
  avatar: {
    src: 'image.png',
  },
};

function doSomethingWithData(data) {
  return {
    prop: data.nested.prop,
    x: data.avatar,
  };
}

const proxy = s.track(originalData);
const result = s.unwrap(doSomethingWithData(proxy));

// proxy is revoked after `s.unwrap()`

const sneakyEqualData = {
  nested: {
    prop: 1,
    other: 'ignored',
  },
  avatar: original.avatar,
};

console.log(s.isEqual(originalData, sneakyEqualData)); // true

const sneakyDifferentData = {
  nested: {
    prop: 2,
  },
  avatar: {
    ...original.avatar,
  },
};

console.log(s.isEqual(originalData, sneakyDifferentData)); // false
```

## LICENSE

This software is licensed under the MIT License.
