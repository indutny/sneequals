import { hasSameOwnKeys, returnFalse, isObject, maybeUnfreeze } from './util';

export interface IWatcher {
  unwrap<Result>(result: Result): Result;
  stop(): void;
  isChanged<Value>(oldValue: Value, newValue: Value): boolean;
}

export type WatchResult<Value> = Readonly<{
  proxy: Value;
  watcher: IWatcher;
}>;

export type WatchAllResult<Values extends ReadonlyArray<unknown>> = Readonly<{
  proxies: Values;
  watcher: IWatcher;
}>;

type AbstractRecord = Record<string | symbol, unknown>;

const kSource: unique symbol = Symbol();
const kTouched: unique symbol = Symbol();
const kTrack: unique symbol = Symbol();
const kSelf: unique symbol = Symbol();
const kAllOwnKeys = true;

type TouchedEntry = {
  readonly keys: Set<string | symbol>;
  readonly has: Set<string | symbol>;
  hasOwn: Set<string | symbol> | typeof kAllOwnKeys;
};

function getSource<Value>(value: Value): Value {
  if (!isObject(value)) {
    return value;
  }

  const source: Value | undefined = (value as Record<symbol, Value>)[kSource];
  return source ?? value;
}

class Watcher implements IWatcher {
  readonly #proxyMap = new WeakMap<object, object>();

  #revokes: Array<() => void> = [];

  /** @internal */
  public readonly [kTouched] = new WeakMap<
    object,
    TouchedEntry | typeof kSelf
  >();

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

        this.#touch(source)?.keys.add(key);
        this[kTouched].set(getSource(unwrappedValue) as object, kSelf);
      }
    }

    return result;
  }

  public stop(): void {
    const revokes = this.#revokes;
    this.#revokes = [];
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

    const touched = this[kTouched].get(oldSource);

    // Object wasn't touched - assuming it is the same.
    if (touched === undefined) {
      return false;
    }

    // We checked that the objects are different above.
    if (touched === kSelf) {
      return true;
    }

    const oldRecord = oldSource as AbstractRecord;
    const newRecord = newValue as AbstractRecord;

    if (touched.hasOwn === kAllOwnKeys) {
      if (!hasSameOwnKeys(oldSource, newValue)) {
        return true;
      }
    } else {
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
      }
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

  /** @internal */
  public [kTrack]<Value>(value: Value): Value {
    // Primitives or functions
    if (!isObject(value)) {
      return value;
    }

    // Return cached proxy
    const entry = this.#proxyMap.get(value);
    if (entry !== undefined) {
      return entry as Value;
    }

    const source = getSource(value);

    // We need to be able to return tracked value on "get" access to the object,
    // but for the frozen object all properties are readonly and
    // non-configurable so Proxy must return the original value.
    const unfrozen = maybeUnfreeze(value, kSource);

    let ignoreKey: string | symbol | undefined;

    const { proxy, revoke } = Proxy.revocable(unfrozen, {
      defineProperty: returnFalse,
      deleteProperty: returnFalse,
      preventExtensions: returnFalse,
      set: returnFalse,
      setPrototypeOf: returnFalse,

      get: (target, key, receiver) => {
        if (key === kSource) {
          return source;
        }

        this.#touch(source)?.keys.add(key);

        const result = this[kTrack](Reflect.get(target, key, receiver));

        // We generate proxies for objects and they cannot be extended, however
        // we can have nested proxies in situations where users wrap the object
        // multiple times.
        //
        // In this case parent proxy's [[Get]] implementation will:
        // 1. Call this "get" trap on the child proxy (through Reflect.get
        //    above)
        // 2. Call [[GetOwnProperty] on the child proxy which will call the
        //    "getOwnPropertyDescriptor" trap in turn.
        //
        // We treat "getOwnPropertyDescriptor" calls as checks for own property,
        // so we ignore these as false positives, and as an extra safety check -
        // we compare that the key was the same.
        //
        // See: https://262.ecma-international.org/6.0/#sec-9.5.8
        if (receiver !== proxy) {
          ignoreKey = key;
        }
        return result;
      },
      getOwnPropertyDescriptor: (target, key) => {
        const oldKey = ignoreKey;
        ignoreKey = undefined;
        if (oldKey !== key && key !== kSource) {
          const hasOwn = this.#touch(source)?.hasOwn;
          if (hasOwn !== kAllOwnKeys) {
            hasOwn?.add(key);
          }
        }

        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      has: (target, key) => {
        this.#touch(source)?.has.add(key);
        return Reflect.has(target, key);
      },
      ownKeys: (target) => {
        const entry = this.#touch(source);
        if (entry) {
          entry.hasOwn = kAllOwnKeys;
        }
        return Reflect.ownKeys(target);
      },
    });

    this.#proxyMap.set(value, proxy);
    this.#revokes.push(revoke);
    return proxy as Value;
  }

  #touch(source: object): TouchedEntry | undefined {
    let touched = this[kTouched].get(source);
    if (touched === kSelf) {
      return undefined;
    }
    if (touched === undefined) {
      touched = {
        keys: new Set(),
        hasOwn: new Set(),
        has: new Set(),
      };
      this[kTouched].set(source, touched);
    }
    return touched;
  }
}

export function watch<Value>(value: Value): WatchResult<Value> {
  const {
    proxies: [proxy],
    watcher,
  } = watchAll([value]);
  return { proxy, watcher };
}

export function watchAll<Values extends ReadonlyArray<unknown>>(
  values: Values,
): WatchAllResult<Values> {
  const watcher = new Watcher();
  return {
    proxies: values.map((value) => watcher[kTrack](value)) as unknown as Values,
    watcher,
  };
}

export interface MemoizeStats<Params extends ReadonlyArray<unknown>> {
  onHit?(): void;
  onMiss?(watcher: IWatcher, params: Params): void;
}

export function memoize<Params extends ReadonlyArray<unknown>, Result>(
  fn: (...params: Params) => Result,

  // Mostly for tests
  stats?: MemoizeStats<Params>,
): (...params: Params) => Result {
  type CacheEntry = Readonly<{
    sources: Params;
    watcher: IWatcher;
    result: Result;
  }>;

  let cached: CacheEntry | undefined;
  return (...params: Params): Result => {
    const sources = params.map((param) =>
      getSource(param),
    ) as unknown as Params;

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

    const { proxies, watcher } = watchAll(params);
    const result = watcher.unwrap(fn(...proxies));
    watcher.stop();

    if (stats?.onMiss) {
      stats.onMiss(watcher, params);
    }

    const newCached = {
      sources,
      watcher,
      result,
    };

    cached = newCached;

    return result;
  };
}

export function getAffectedPaths(
  watcher: IWatcher,
  value: unknown,
): ReadonlyArray<string> {
  if (!(watcher instanceof Watcher)) {
    return [];
  }

  const out: Array<string> = [];
  getAffectedPathsInto(watcher, value, '$', out);
  return out;
}

function getAffectedPathsInto(
  watcher: Watcher,
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
  const touched = watcher[kTouched].get(source);

  if (touched === undefined) {
    return;
  }

  if (touched === kSelf) {
    out.push(path);
    return;
  }

  if (touched.hasOwn === kAllOwnKeys) {
    out.push(`${path}:allOwnKeys`);
  } else {
    for (const key of touched.hasOwn) {
      out.push(`${path}:hasOwn(${String(key)})`);
    }
  }

  for (const key of touched.has) {
    out.push(`${path}:has(${String(key)})`);
  }

  const record = source as AbstractRecord;
  for (const key of touched.keys) {
    getAffectedPathsInto(watcher, record[key], `${path}.${String(key)}`, out);
  }
}
