import { normalizeModels } from '../normalizer';

class ValidClassModel {
  processBlock() {}
}

class NotZeroArgModel {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_required: string) {
    // single-arg ctor → length 1
  }
  processBlock() {}
}

const fakeWalker = jest.fn();

describe('normalizeModels', () => {
  it('passes class models with processBlock through as-is', () => {
    const result = normalizeModels([ValidClassModel as any], fakeWalker as any);
    expect(result).toHaveLength(1);
    // The same constructor reference should come back since validation is the only step.
    expect(result[0]).toBe(ValidClassModel);
  });

  it('compiles declarative models via the provided walker', () => {
    const declarative = {
      modelId: 'test-decl',
      state: () => ({}),
      sources: {},
      reducers: {},
    };
    const result = normalizeModels([declarative as any], fakeWalker as any);
    expect(result).toHaveLength(1);
    // Compiled is a constructor function (the compileStateModel output).
    expect(typeof result[0]).toBe('function');
  });

  it('rejects models whose constructor has non-zero arity', () => {
    expect(() => normalizeModels([NotZeroArgModel as any], fakeWalker as any)).toThrow(
      /must have a zero-args constructor/
    );
  });

  it('rejects invalid declarative inputs (missing modelId)', () => {
    const broken = { state: () => ({}) };
    expect(() => normalizeModels([broken as any], fakeWalker as any)).toThrow(/Unsupported model provider/);
  });

  it('rejects invalid declarative inputs (missing state)', () => {
    const broken = { modelId: 'no-state' };
    expect(() => normalizeModels([broken as any], fakeWalker as any)).toThrow(/Unsupported model provider/);
  });

  it('rejects entirely unrecognized input shapes', () => {
    expect(() => normalizeModels([{} as any], fakeWalker as any)).toThrow(/Unsupported model provider/);
    expect(() => normalizeModels(['string-not-a-model' as any], fakeWalker as any)).toThrow(
      /Unsupported model provider/
    );
  });

  it('handles empty input', () => {
    expect(normalizeModels([], fakeWalker as any)).toEqual([]);
    expect(normalizeModels(null as any, fakeWalker as any)).toEqual([]);
    expect(normalizeModels(undefined as any, fakeWalker as any)).toEqual([]);
  });
});
