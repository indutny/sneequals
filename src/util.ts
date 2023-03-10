import { ownKeys } from './reflect';

export const hasSameOwnKeys = (a: object, b: object): boolean => {
  const aKeys = ownKeys(a);
  const bKeys = ownKeys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }
  }

  return true;
};

export const returnFalse = () => false;

export const isObject = (value: unknown): value is object =>
  value !== null && typeof value === 'object';

const unfreezeCache = new WeakMap<object, object>();

export const maybeUnfreeze = <Value extends object>(
  value: Value,
  kSource: symbol,
): Value => {
  if (!Object.isFrozen(value)) {
    return value;
  }

  const cached = unfreezeCache.get(value);
  if (cached !== undefined) {
    return cached as Value;
  }

  let result: Value;
  if (Array.isArray(value)) {
    result = Array.from(value) as Value;
  } else {
    const copy = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      descriptor.configurable = true;
    }
    Object.defineProperties(copy, descriptors);

    result = copy as Value;
  }
  Object.defineProperty(result, kSource, {
    configurable: false,
    enumerable: false,
    writable: false,
    value,
  });
  unfreezeCache.set(value, result);
  return result;
};
