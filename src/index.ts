import { hasSameOwnKeys, returnFalse, isObject, maybeUnfreeze } from './util';

/**
 * Result of `watch(value)` call.
 *
 * @public
 * @typeParam Value - Type of the value.
 * @see {@link watch} for usage examples.
 */
export type WatchResult<Value> = Readonly<{
  /**
   * Proxy object for the input value. Use this to derive data from it while
   * tracking the property access.
   */
  proxy: Value;

  /**
   * The watcher object associated with the `proxy`.
   *
   * @see {@link IWatcher} for API reference.
   */
  watcher: IWatcher;
}>;

/**
 * Result of `watchAll(values)` call.
 *
 * @public
 * @typeParam Value - Type of the value.
 * @see {@link watchAll} for usage examples.
 */
export type WatchAllResult<Values extends ReadonlyArray<unknown>> = Readonly<{
  /**
   * Proxy objects for the input values.
   *
   * @see {@link WatchResult} for details.
   */
  proxies: Values;

  /**
   * The watcher object associated with `proxies`.
   *
   * @see {@link IWatcher} for API reference.
   */
  watcher: IWatcher;
}>;

/**
 * API interface for `watcher` property of `WatchResult` and `WatchAllResult`.
 *
 * @public
 */
export interface IWatcher {
  /**
   * Unwraps the result derived from the input value proxy.
   *
   * The `result` object may contain proxies if sub-objects of the input value
   * proxy were put into the derived data as they are. This method will replace
   * all proxy occurences with their underlying object's value so that the
   * final result is proxy-free.
   *
   * @param result - The derived result object that might contain proxies in its
   *                 sub-properties.
   * @returns The result without proxies in any of its deep sub-properties.
   */
  unwrap<Result>(result: Result): Result;

  /**
   * Stops tracking of property access for the proxies associated with this
   * watcher. Accessing proxy (or sub-proxy) properties after calling
   * `watcher.stop()` will generate a runtime error.
   *
   * Use this to make sure at runtime that no Proxy ends up in your derived
   * data.
   */
  stop(): void;

  /**
   * Returns `true` if tracked sub-properties of `oldValue` are different from
   * (or not present in) the `newValue`. `oldValue` must be either the
   * `value` parameter of `watch` (or one of the `values` of `watchAll`) or
   * a sub-object of it.
   *
   * @see {@link watch}
   * @see {@link watchAll}
   *
   * @param oldValue - `value` argument of `watch`/`watchAll` or its sub-object.
   * @param newValue - any object or primitive to compare against.
   * @returns `true` if tracked properties are different, otherwise - `false`.
   */
  isChanged<Value>(oldValue: Value, newValue: Value): boolean;
}

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

  /**
   * @see {@link IWatcher}
   * @internal
   */
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

  /**
   * @see {@link IWatcher}
   * @internal
   */
  public stop(): void {
    const revokes = this.#revokes;
    this.#revokes = [];
    for (const revoke of revokes) {
      revoke();
    }
  }

  /**
   * @see {@link IWatcher}
   * @internal
   */
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

/**
 * Wraps the `value` into a proxy and returns a `WatchResult` to track the
 * property (and sub-property) access of the object and compare objects.
 *
 * @see {@link WatchResult}
 * @param value - input value which could be a plain object, array, function or
 *                a primitive.
 * @returns WatchResult object that holds the `proxy` for the `value` and
 *          `watcher` object that tracks property access and does the
 *          comparison.
 *
 * @example
 * Here's the example with different objects, but unchanged accessed properties:
 * ```
 * import { watch } from '@indutny/sneequals';
 *
 * const value = { a: { b: 1 } };
 * const { proxy, watcher } = watch(value);
 * const derived = watcher.unwrap({ b: proxy.a.b });
 *
 * // Further access to `proxy` (or its sub-proxies) would throw.
 * watcher.stop();
 *
 * // Prints `{ b: 1 }`
 * console.log(derived);
 *
 * const sameProperties = { a: { b: 1 } };
 *
 * // Prints `false` because these are different objects.
 * console.log(sameProperties === value);
 *
 * // Prints `false` because the tracked `value.a.b` didn't change.
 * console.log(watcher.isChanged(value, sameProperties));
 * ```
 */
export function watch<Value>(value: Value): WatchResult<Value> {
  const {
    proxies: [proxy],
    watcher,
  } = watchAll([value]);
  return { proxy, watcher };
}

/**
 * Similar to `watch(value)` this method wraps a list of values with a single
 * `IWatcher` instance and tracks access to properties (sub-properties) of each
 * individual element of the `values` list.
 *
 * @see {@link WatchAllResult}
 * @param values - list of input values that could be plain objects, arrays,
 *                 functions or primitives.
 * @returns WatchAllResult object that holds the `proxies` for the `values` and
 *          `watcher` object that tracks property access and does the
 *          comparison.
 *
 * @example
 * Here's the example with different objects, but unchanged accessed properties:
 * ```
 * import { watchAll } from '@indutny/sneequals';
 *
 * const values = [{ a: { b: 1 } }, { c: 2 }];
 * const { proxies, watcher } = watchAll(value);
 * const derived = watcher.unwrap({ b: proxies[0].a.b, c: proxies[1].c });
 *
 * // Further access to `proxy` (or its sub-proxies) would throw.
 * watcher.stop();
 *
 * // Prints `{ b: 1, c: 2 }`
 * console.log(derived);
 *
 * // Prints `false` because the tracked `value.a.b` didn't change.
 * console.log(watcher.isChanged(values[0], { a: { b: 1 } }));
 *
 * // Prints `true` because the tracked `value.c` changed.
 * console.log(watcher.isChanged(values[1], { c: 3 }));
 * ```
 */
export function watchAll<Values extends ReadonlyArray<unknown>>(
  values: Values,
): WatchAllResult<Values> {
  const watcher = new Watcher();
  return {
    proxies: values.map((value) => watcher[kTrack](value)) as unknown as Values,
    watcher,
  };
}

/**
 * Options for `memoize()` method.
 *
 * @see {@link memoize} for additional details.
 */
export interface IMemoizeOptions<Params extends ReadonlyArray<unknown>> {
  /**
   * This optional method is called on every cache hit.
   */
  onHit?(): void;

  /**
   * This optional method is called on every cache miss.
   *
   * Note that since `params` were used when creating the `watcher` - you can
   * use them in `watcher` API methods and in `getAffectedPaths`.
   *
   * @param watcher - the newly created `IWatcher` object created with
   *                  `watchAll(params)` API method.
   * @param params - an array of parameters that generated the cache miss.
   *
   * @see {@link IWatcher}
   * @see {@link watchAll}
   * @see {@link getAffectedPaths}
   */
  onMiss?(watcher: IWatcher, params: Params): void;
}

/**
 * Returns memoized version of the parameter function `fn`. The memoized
 * function will return cached value as long as the arguments of the call have
 * the same tracked values as the last time.
 *
 * Note that this means that the memoized function keeps at most one cached
 * result, similar to redux's `reselect`:
 * {@link https://github.com/reduxjs/reselect}.
 *
 * @see {@link IMemoizeOptions} for details on available options.
 *
 * @param fn - function to be memoized
 * @param options - an optional options object
 * @returns memoized function.
 *
 * @example
 * With two parameters:
 * ```
 * import { memoize } from '@indutny/sneequals';
 *
 * const fn = memoize((a, b) => ({ result: a.value + b.value }));
 *
 * // Prints `{ result: 3 }`
 * const answer = fn({ value: 1 }, { value: 2 });
 * console.log(answer);
 *
 * const cachedAnswer = fn({ value: 1 }, { value: 2 });
 *
 * // Even though the input objects are different the `cachedResult` is the
 * // same since the tracked properties didn't change.
 * // Prints `true`.
 * console.log(answer === cachedAnswer);
 * ```
 */
export function memoize<Params extends ReadonlyArray<unknown>, Result>(
  fn: (...params: Params) => Result,

  // Mostly for tests
  options?: IMemoizeOptions<Params>,
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
        options?.onHit?.();
        return cached.result;
      }
    }

    const { proxies, watcher } = watchAll(params);
    const result = watcher.unwrap(fn(...proxies));
    watcher.stop();

    if (options?.onMiss) {
      options.onMiss(watcher, params);
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

/**
 * Returns a list of affected (accessed) JSON paths (and sub-paths) in the
 * `value`. This function is provided mostly as a debugging tool to see which
 * JSON paths might have caused the cache invalidation in `memoize()`.
 *
 * @param watcher - A watcher object that tracked the access to paths/sub-paths
 *                  of the `value`
 * @param value - A `value` tracked by `watcher`
 *
 * @see {@link IWatcher}
 * @see {@link watch} for the details on how to get an `IWatcher` instance.
 * @see {@link memoize}
 *
 * @example
 * ```
 * import { watch, getAffectedPaths } from '@indutny/sneequals';
 *
 * const value = { a: { b: 1 } };
 * const { proxy, watcher } = watch(value);
 *
 * // Prints `1`
 * console.log(proxy.a.b);
 *
 * // Prints `['a.b']`
 * console.log(getAffectedPaths(watcher, value));
 * ```
 */
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
