/**
 * Recursively freezes an object and all of its nested objects.
 *
 * Cycle protection: a shared `WeakSet` tracks already-visited objects so cyclic
 * references do not cause infinite recursion (e.g. when a normalized EVM block
 * payload references a sibling structure).
 *
 * Early-return guard: an already frozen subtree is not re-traversed, which keeps
 * the cost bounded when the same structure is frozen multiple times.
 *
 * Returns the input value unchanged for null/undefined/primitives. For object
 * inputs, returns the now-frozen object reference.
 */
export function deepFreeze<T>(obj: T, seen: WeakSet<object> = new WeakSet()): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  if (seen.has(obj as object)) return obj;
  seen.add(obj as object);

  for (const name of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[name];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val, seen);
    }
  }

  return Object.freeze(obj);
}
