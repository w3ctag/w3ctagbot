export function notNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

/** If `obj[key]` already exists, returns it. Otherwise sets it to `deflt` and returns that.
 *
 * @returns the new value of obj[key]
 */
export function setDefault<K extends string | symbol, V>(
  obj: { [key in K]: V },
  key: K,
  deflt: V,
): V {
  const val = obj[key];
  if (!val) {
    obj[key] = deflt;
    return deflt;
  }
  return val;
}

/** If `map.get(key)` already exists, returns it. Otherwise sets it to `deflt` and returns that.
 *
 * @returns the new value of obj.get(key)
 */
export function setMapDefault<K, V>(map: Map<K, V>, key: K, deflt: V): V {
  const val = map.get(key);
  if (!val) {
    map.set(key, deflt);
    return deflt;
  }
  return val;
}

export function buildUrl(
  base: string | URL,
  params: Record<string, string>,
): URL {
  const result = new URL(base);
  result.search = new URLSearchParams(params).toString();
  return result;
}

export function hasOwn<K extends PropertyKey, V>(
  obj: Record<K, V>,
  key: PropertyKey,
): key is K {
  return Object.hasOwn(obj, key);
}
