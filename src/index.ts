import { hasSameOwnKeys, throwReadOnly, isObject } from './util';

type AbstractRecord = Record<string | symbol, unknown>;

type TouchedEntry = {
  readonly keys: Set<string | symbol>;
  readonly ownKeys: Set<string | symbol>;
  self: boolean;
  allOwnKeys: boolean;
};

export type WatchResult<Value> = Readonly<{
  proxy: Value;
  watcher: Watcher;
}>;

export type WatchAllResult<Values extends ReadonlyArray<unknown>> = Readonly<{
  proxies: Values;
  watcher: Watcher;
}>;

export class Watcher {
  private readonly proxyMap = new WeakMap<object, object>();
  private readonly touched = new WeakMap<object, TouchedEntry>();
  private readonly kSource: symbol = Symbol('kSource');

  private revokes = new Array<() => void>();

  protected constructor() {
    // disallow constructing directly.
  }

  public static watch<Value>(value: Value): WatchResult<Value> {
    const watcher = new Watcher();
    return {
      proxy: watcher.track(value),
      watcher,
    };
  }

  public static watchAll<Values extends ReadonlyArray<unknown>>(
    values: Values,
  ): WatchAllResult<Values> {
    const watcher = new Watcher();
    return {
      proxies: values.map((value) => watcher.track(value)) as unknown as Values,
      watcher,
    };
  }

  public unwrap<Result>(result: Result): Result {
    // Primitives and functions
    if (!isObject(result)) {
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

  public stop(): void {
    const revokes = this.revokes;
    this.revokes = [];
    for (const revoke of revokes) {
      revoke();
    }
  }

  public isChanged<Value>(oldValue: Value, newValue: Value): boolean {
    // Primitives or functions
    if (!isObject(oldValue) || !isObject(newValue)) {
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
    // Primitives or functions
    if (!isObject(value)) {
      return value;
    }

    // Return cached proxy
    const entry = this.proxyMap.get(value);
    if (entry !== undefined) {
      return entry as Value;
    }

    const { proxy, revoke } = Proxy.revocable(value, {
      defineProperty: throwReadOnly,
      deleteProperty: throwReadOnly,
      preventExtensions: throwReadOnly,
      set: throwReadOnly,
      setPrototypeOf: throwReadOnly,

      get: (target, key) => {
        if (key === this.kSource) {
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

    this.proxyMap.set(value, proxy);
    this.revokes.push(revoke);
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
        this.kSource
      ];
      if (source === undefined) {
        break;
      }
      result = source;
    }
    return result;
  }
}

export function watch<Value>(value: Value): WatchResult<Value> {
  return Watcher.watch(value);
}

export function watchAll<Values extends ReadonlyArray<unknown>>(
  values: Values,
): WatchAllResult<Values> {
  return Watcher.watchAll(values);
}

export interface MemoizeStats {
  onHit?(): void;
  onMiss?(): void;
}

export function memoize<Params extends ReadonlyArray<unknown>, Result>(
  fn: (...params: Params) => Result,

  // Mostly for tests
  stats?: MemoizeStats,
): (...params: Params) => Result {
  type CacheEntry = Readonly<{
    params: Params;
    watcher: Watcher;
    result: Result;
  }>;

  const kGlobal = {};

  const cacheMap = new WeakMap<object, CacheEntry | undefined>();
  return (...params: Params): Result => {
    const cacheKey = params.find((param) => isObject(param)) ?? kGlobal;
    const cached = cacheMap.get(cacheKey) ?? cacheMap.get(kGlobal);

    if (cached !== undefined && cached.params.length === params.length) {
      let isValid = true;
      for (let i = 0; i < cached.params.length; i++) {
        if (cached.watcher.isChanged(cached.params[i], params[i])) {
          isValid = false;
          break;
        }
      }
      if (isValid) {
        stats?.onHit?.();
        return cached.result;
      }
    }

    stats?.onMiss?.();
    const { proxies, watcher } = watchAll(params);
    const result = watcher.unwrap(fn(...proxies));

    const newCached = {
      params,
      watcher,
      result,
    };

    cacheMap.set(cacheKey, newCached);
    if (cacheKey !== kGlobal) {
      cacheMap.set(kGlobal, newCached);
    }

    return result;
  };
}
