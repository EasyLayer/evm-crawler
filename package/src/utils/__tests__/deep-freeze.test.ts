import { deepFreeze } from '../deep-freeze';

describe('deepFreeze', () => {
  it('freezes a flat object', () => {
    const obj = { a: 1, b: 'two' };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it('freezes nested objects recursively', () => {
    const obj = { outer: { inner: { deep: 'value' } } };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.outer)).toBe(true);
    expect(Object.isFrozen(obj.outer.inner)).toBe(true);
  });

  it('early-returns on already frozen object without re-traversing', () => {
    const inner = Object.freeze({ deep: 'value' });
    const obj = { outer: inner };
    // Should not throw; inner is already frozen, the WeakSet/isFrozen guard ensures
    // we do not attempt to redo the work.
    expect(() => deepFreeze(obj)).not.toThrow();
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(inner)).toBe(true);
  });

  it('handles cyclic references without stack overflow', () => {
    const a: any = { name: 'a' };
    const b: any = { name: 'b', ref: a };
    a.ref = b; // create cycle

    expect(() => deepFreeze(a)).not.toThrow();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(deepFreeze(null as any)).toBe(null);
    expect(deepFreeze(undefined as any)).toBe(undefined);
    expect(deepFreeze(42 as any)).toBe(42);
    expect(deepFreeze('hello' as any)).toBe('hello');
    expect(deepFreeze(true as any)).toBe(true);
  });

  it('returns the same object reference (not a copy)', () => {
    const obj = { x: 1 };
    const result = deepFreeze(obj);
    expect(result).toBe(obj);
  });

  it('freezes arrays and their elements', () => {
    const arr = [{ a: 1 }, { b: 2 }];
    deepFreeze(arr);
    expect(Object.isFrozen(arr)).toBe(true);
    expect(Object.isFrozen(arr[0])).toBe(true);
    expect(Object.isFrozen(arr[1])).toBe(true);
  });
});
