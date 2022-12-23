const throwReadOnly = () => {
  throw new Error('Object is read-only');
};

const kSource: unique symbol = Symbol('kSource');
const kSelf: unique symbol = Symbol('kSelf');
const kOwnKeys: unique symbol = Symbol('kOwnKeys');

type AbstractRecord = Record<string | symbol, unknown>;

type ProxyMapEntry = Readonly<{
  proxy: object;
  revoke(): void;
}>;

export class SneakyEquals {
  private readonly proxyMap = new Map<object, ProxyMapEntry>();
  private readonly touched = new WeakMap<
    object,
    Set<string | symbol> | typeof kSelf
  >();
  private depth = 0;

  public produce<Input, Output>(
    input: Input,
    producer: (input: Input) => Output,
  ): Output {
    try {
      this.depth++;
      return this.unwrap(producer(this.track(input)));
    } finally {
      // We are top-level caller - revoke all proxies
      if (--this.depth === 0) {
        for (const { revoke } of this.proxyMap.values()) {
          revoke();
        }
        this.proxyMap.clear();
      }
    }
  }

  public wasTouched<Value>(oldValue: Value): boolean {
    // Primitives
    if (oldValue === null || typeof oldValue !== 'object') {
      return false;
    }
    return this.touched.has(oldValue);
  }

  public isChanged<Value>(oldValue: Value, newValue: Value): boolean {
    // Fast case!
    if (oldValue === newValue) {
      return false;
    }

    // Primitives
    if (
      oldValue === null ||
      typeof oldValue !== 'object' ||
      newValue === null ||
      typeof newValue !== 'object'
    ) {
      return oldValue !== newValue;
    }

    const touched = this.touched.get(oldValue);

    // Object wasn't touched - assuming it is the same.
    if (touched === undefined) {
      return false;
    }

    // We checked that the objects are different above.
    if (touched === kSelf) {
      return true;
    }

    for (const key of touched) {
      if (key === kOwnKeys) {
        if (!hasSameOwnValues(oldValue, newValue)) {
          return true;
        }
      }

      const areDifferent = this.isChanged(
        (oldValue as AbstractRecord)[key],
        (newValue as AbstractRecord)[key],
      );

      if (areDifferent) {
        return true;
      }
    }

    return false;
  }

  private track<Value>(value: Value): Value {
    // Primitives
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if ((value as AbstractRecord)[kSource] !== undefined) {
      return this.track((value as AbstractRecord)[kSource] as Value);
    }

    // Return cached proxy
    const entry = this.proxyMap.get(value);
    if (entry !== undefined) {
      return entry.proxy as Value;
    }

    const { proxy, revoke } = Proxy.revocable(value, {
      defineProperty: throwReadOnly,
      deleteProperty: throwReadOnly,
      preventExtensions: throwReadOnly,
      set: throwReadOnly,
      setPrototypeOf: throwReadOnly,

      get: (target, key) => {
        if (key === kSource) {
          return value;
        }

        this.touch(target, key);

        const result = (target as AbstractRecord)[key];
        return this.track(result);
      },
      getOwnPropertyDescriptor: (target, key) => {
        // TODO(indutny): dont' "deoptimize" this.
        this.touch(target, kSelf);
        return Object.getOwnPropertyDescriptor(target, key);
      },
      has: (target, key) => {
        this.touch(target, key);
        return key in target;
      },
      ownKeys: (target) => {
        this.touch(target, kOwnKeys);
        return Reflect.ownKeys(target);
      },
    });

    this.proxyMap.set(value, { proxy, revoke });
    this.touched.set(value, new Set());
    return proxy as Value;
  }

  private unwrap<Result>(wrapped: Result): Result {
    // Primitives
    if (wrapped === null || typeof wrapped !== 'object') {
      return wrapped;
    }

    const source: Result | undefined = (wrapped as Record<symbol, Result>)[
      kSource
    ];

    let result = source ?? wrapped;
    let isCopied = false;

    for (const key of Reflect.ownKeys(result)) {
      const value = (result as AbstractRecord)[key];
      const unwrappedValue = this.unwrap(value);
      if (unwrappedValue !== value) {
        if (!isCopied) {
          result = { ...result };
          isCopied = true;
        }

        (result as AbstractRecord)[key] = unwrappedValue;

        this.touch(result, key);
        this.touch(unwrappedValue as object, kSelf);
      }
    }

    return result;
  }

  private touch(target: object, key: string | symbol | typeof kSelf): void {
    const touched = this.touched.get(target);
    if (touched === undefined) {
      return;
    }

    if (key === kSelf) {
      this.touched.set(target, key as typeof kSelf);
      return;
    }

    // Already in terminal state
    if (touched === kSelf) {
      return;
    }

    touched.add(key);
  }
}

function hasSameOwnValues(a: object, b: object): boolean {
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
