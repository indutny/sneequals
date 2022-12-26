import { hasSameOwnKeys, throwReadOnly, isObject, maybeUnfreeze } from './util';

type AbstractRecord = Record<string | symbol, unknown>;

type TouchedEntry = {
  readonly keys: Set<string | symbol>;
  readonly has: Set<string | symbol>;
  readonly hasOwn: Set<string | symbol>;
  self: boolean;
  allOwnKeys: boolean;
};

export type WatchResult<Value> = Readonly<{
  proxy: Value;
  watcher: IWatcher;
}>;

export type WatchAllResult<Values extends ReadonlyArray<unknown>> = Readonly<{
  proxies: Values;
  watcher: IWatcher;
}>;

const kSource: unique symbol = Symbol('kSource');

function getSource<Value>(value: Value): Value {
  if (!isObject(value)) {
    return value;
  }

  let result: object = value;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const source: object | undefined = (result as Record<symbol, object>)[
      kSource
    ];
    if (source === undefined) {
      break;
    }
    result = source;
  }
  return result as Value;
}

export interface IWatcher {
  unwrap<Result>(result: Result): Result;
  stop(): void;
  isChanged<Value>(oldValue: Value, newValue: Value): boolean;
  getAffectedPaths(value: unknown): Array<string>;
}

class Watcher implements IWatcher {
  private readonly proxyMap = new WeakMap<object, object>();
  private readonly touched = new WeakMap<object, TouchedEntry>();

  private revokes: Array<() => void> = [];

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

    const source = getSource(result);

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

    const oldSource = getSource(oldValue);

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

    for (const key of touched.hasOwn) {
      const hasOld =
        Reflect.getOwnPropertyDescriptor(oldRecord, key) !== undefined;
      const hasNew =
        Reflect.getOwnPropertyDescriptor(newRecord, key) !== undefined;

      if (hasOld !== hasNew) {
        return true;
      }

      // For simplicity we assume that `getOwnPropertyDescriptor` is used only
      // as a check for property presence and not for the actual
      // value/configurable/enumerable present in the descriptor.
      //
      // It is called after each [[Get]] so if it is not presence check -
      // the key should be also in `touched.keys`.
      //
      // See: https://262.ecma-international.org/6.0/#sec-9.5.8
    }

    for (const key of touched.has) {
      if (Reflect.has(oldRecord, key) !== Reflect.has(newRecord, key)) {
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

  public getAffectedPaths(value: unknown): Array<string> {
    const out: Array<string> = [];
    this.getAffectedPathsInto(value, '$', out);
    return out;
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

    // We need to be able to return tracked value on "get" access to the object,
    // but for the frozen object all properties are readonly and
    // non-configurable so Proxy must return the original value.
    const unfrozen = maybeUnfreeze(value, kSource);

    const { proxy, revoke } = Proxy.revocable(unfrozen, {
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

        const result = Reflect.get(target, key);
        return this.track(result);
      },
      getOwnPropertyDescriptor: (target, key) => {
        if (key !== kSource) {
          this.touch(target).hasOwn.add(key);
        }

        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      has: (target, key) => {
        this.touch(target).has.add(key);
        return Reflect.has(target, key);
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
    const source = getSource(target);

    let touched = this.touched.get(source);
    if (touched === undefined) {
      touched = {
        keys: new Set(),
        hasOwn: new Set(),
        has: new Set(),
        self: false,
        allOwnKeys: false,
      };
      this.touched.set(source, touched);
    }
    return touched;
  }

  private getAffectedPathsInto(
    value: unknown,
    path: string,
    out: Array<string>,
  ): void {
    if (!isObject(value)) {
      if (path !== '$') {
        out.push(path);
      }
      return;
    }

    const source = getSource(value);
    const touched = this.touched.get(source);

    if (touched === undefined) {
      return;
    }

    if (touched.self) {
      out.push(path);
      return;
    }

    if (touched.allOwnKeys) {
      out.push(`${path}[*]`);
    }

    const record = source as AbstractRecord;
    for (const key of touched.hasOwn) {
      out.push(`${path}:hasOwn(${String(key)})`);
    }

    for (const key of touched.has) {
      out.push(`${path}:has(${String(key)})`);
    }

    for (const key of touched.keys) {
      this.getAffectedPathsInto(record[key], `${path}.${String(key)}`, out);
    }
  }
}

export function watch<Value>(value: Value): WatchResult<Value> {
  const {
    proxies: [proxy],
    watcher,
  } = Watcher.watchAll([value]);
  return { proxy, watcher };
}

export function watchAll<Values extends ReadonlyArray<unknown>>(
  values: Values,
): WatchAllResult<Values> {
  return Watcher.watchAll(values);
}

export interface MemoizeStats {
  onHit?(): void;
  onMiss?(): void;
  onAdd?(...paths: Array<ReadonlyArray<string>>): void;
}

export function memoize<Params extends ReadonlyArray<unknown>, Result>(
  fn: (...params: Params) => Result,

  // Mostly for tests
  stats?: MemoizeStats,
): (...params: Params) => Result {
  type CacheEntry = Readonly<{
    sources: Params;
    watcher: IWatcher;
    result: Result;
  }>;

  const kGlobal = {};

  const cacheMap = new WeakMap<object, CacheEntry | undefined>();
  return (...params: Params): Result => {
    const sources = params.map((param) =>
      getSource(param),
    ) as unknown as Params;
    const cacheKey = sources.find((source) => isObject(source)) ?? kGlobal;
    const cached = cacheMap.get(cacheKey) ?? cacheMap.get(kGlobal);

    if (cached !== undefined && cached.sources.length === sources.length) {
      let isValid = true;
      for (let i = 0; i < cached.sources.length; i++) {
        if (cached.watcher.isChanged(cached.sources[i], sources[i])) {
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
    watcher.stop();

    if (stats?.onAdd) {
      stats.onAdd(...sources.map((param) => watcher.getAffectedPaths(param)));
    }

    const newCached = {
      sources,
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
