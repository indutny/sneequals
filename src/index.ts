import { hasSameOwnKeys, throwReadOnly } from './util';

type AbstractRecord = Record<string | symbol, unknown>;

type ProxyMapEntry = Readonly<{
  proxy: object;
  revoke(): void;
}>;

type TouchedEntry = {
  readonly keys: Set<string | symbol>;
  readonly ownKeys: Set<string | symbol>;
  self: boolean;
  allOwnKeys: boolean;
};

export type WrapResult<Value> = Readonly<{
  proxy: Value;
  changelog: ChangeLog;
}>;

const kSource: unique symbol = Symbol('kSource');

export class ChangeLog {
  private readonly proxyMap = new Map<object, ProxyMapEntry>();
  private readonly touched = new WeakMap<object, TouchedEntry>();

  protected constructor() {
    // disallow constructing directly.
  }

  public static wrap<Value>(value: Value): WrapResult<Value> {
    const changelog = new ChangeLog();
    return {
      proxy: changelog.track(value),
      changelog,
    };
  }

  public unwrap<Result>(result: Result): Result {
    // Primitives
    if (result === null || typeof result !== 'object') {
      return result;
    }

    const source = this.getSource(result);

    // If it was a proxy - just unwrap it
    if (source !== result) {
      return source;
    }

    // Generated object
    for (const key of Reflect.ownKeys(result)) {
      const value = (result as AbstractRecord)[key];
      const unwrappedValue = this.unwrap(value);
      if (unwrappedValue !== value) {
        // It is safe to update the result since it is a generated object.
        (result as AbstractRecord)[key] = unwrappedValue;

        this.touched.get(result);
        this.touch(result).keys.add(key);
        this.touch(unwrappedValue as object).self = true;
      }
    }

    return result;
  }

  public freeze(): void {
    for (const { revoke } of this.proxyMap.values()) {
      revoke();
    }
    this.proxyMap.clear();
  }

  public isChanged<Value>(oldValue: Value, newValue: Value): boolean {
    // Primitives
    if (
      oldValue === null ||
      typeof oldValue !== 'object' ||
      newValue === null ||
      typeof newValue !== 'object'
    ) {
      return oldValue !== newValue;
    }

    const oldSource = this.getSource(oldValue);

    // Fast case!
    if (oldSource === newValue) {
      return false;
    }

    const touched = this.touched.get(oldSource);

    // Object wasn't touched - assuming it is the same.
    if (touched === undefined) {
      return false;
    }

    // We checked that the objects are different above.
    if (touched.self) {
      return true;
    }

    if (touched.allOwnKeys && !hasSameOwnKeys(oldSource, newValue)) {
      return true;
    }

    const oldRecord = oldSource as AbstractRecord;
    const newRecord = newValue as AbstractRecord;

    for (const key of touched.ownKeys) {
      const hasOld = Object.hasOwn(oldRecord, key);
      const hasNew = Object.hasOwn(newRecord, key);
      if (hasOld !== hasNew) {
        return true;
      }
      if (!hasOld) {
        continue;
      }

      if (this.isChanged(oldRecord[key], newRecord[key])) {
        return true;
      }
    }

    for (const key of touched.keys) {
      if (this.isChanged(oldRecord[key], newRecord[key])) {
        return true;
      }
    }

    return false;
  }

  //
  // Protected
  //

  protected track<Value>(value: Value): Value {
    // Primitives
    if (value === null || typeof value !== 'object') {
      return value;
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

        this.touch(target).keys.add(key);

        const result = (target as AbstractRecord)[key];
        return this.track(result);
      },
      getOwnPropertyDescriptor: (target, key) => {
        this.touch(target).ownKeys.add(key);
        return Object.getOwnPropertyDescriptor(target, key);
      },
      has: (target, key) => {
        this.touch(target).keys.add(key);
        return key in target;
      },
      ownKeys: (target) => {
        this.touch(target).allOwnKeys = true;
        return Reflect.ownKeys(target);
      },
    });

    this.proxyMap.set(value, { proxy, revoke });
    return proxy as Value;
  }

  //
  // Private
  //

  private touch(target: object): TouchedEntry {
    const source = this.getSource(target);

    let touched = this.touched.get(source);
    if (touched === undefined) {
      touched = {
        keys: new Set(),
        ownKeys: new Set(),
        self: false,
        allOwnKeys: false,
      };
      this.touched.set(source, touched);
    }
    return touched;
  }

  private getSource<Value extends object>(value: Value): Value {
    let result = value;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const source: Value | undefined = (result as Record<symbol, Value>)[
        kSource
      ];
      if (source === undefined) {
        break;
      }
      result = source;
    }
    return result;
  }
}

export function wrap<Value>(value: Value): WrapResult<Value> {
  return ChangeLog.wrap(value);
}
