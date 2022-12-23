# @indutny/sneaky-equals

Sneaky equals comparison between objects that checks only the properties that
were touched.

## Installation

```sh
npm install @indutny/sneaky-equals
```

## Usage

```js
import { wrap } from '@indutny/sneaky-equals';

const originalData = {
  nested: {
    prop: 1,
  },
  avatar: {
    src: 'image.png',
  },
};

const { proxy, changelog } = wrap(originalData);

function doSomethingWithData(data) {
  return {
    prop: data.nested.prop,
    x: data.avatar,
  };
}

const result = changelog.unwrap(doSomethingWithData(proxy));

// Prevent further access to proxy
changelog.freeze();

const sneakyEqualData = {
  nested: {
    prop: 1,
    other: 'ignored',
  },
  avatar: original.avatar,
};

console.log(changelog.isEqual(originalData, sneakyEqualData)); // true

const sneakyDifferentData = {
  nested: {
    prop: 2,
  },
  avatar: {
    ...original.avatar,
  },
};

console.log(changelog.isEqual(originalData, sneakyDifferentData)); // false
```

## LICENSE

This software is licensed under the MIT License.
