export function hasSameOwnKeys(a: object, b: object): boolean {
  const aKeys = Reflect.ownKeys(a);
  const bKeys = Reflect.ownKeys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }
  }

  return true;
}

export function throwReadOnly<Result>(): Result {
  throw new Error('Object is read-only');
}

export function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}
