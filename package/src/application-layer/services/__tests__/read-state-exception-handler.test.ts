import { Subject } from 'rxjs';
import { ReadStateExceptionHandlerService } from '../read-state-exception-handler.service';

describe('ReadStateExceptionHandlerService', () => {
  let stream$: Subject<any>;
  let unhandledExceptionBus: any;

  beforeEach(() => {
    stream$ = new Subject<any>();
    unhandledExceptionBus = { stream$ };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to stream$ on onModuleInit', () => {
    const svc = new ReadStateExceptionHandlerService(unhandledExceptionBus);
    expect(stream$.observed).toBe(false);
    svc.onModuleInit();
    expect(stream$.observed).toBe(true);
  });

  it('unsubscribes on onModuleDestroy', () => {
    const svc = new ReadStateExceptionHandlerService(unhandledExceptionBus);
    svc.onModuleInit();
    svc.onModuleDestroy();
    expect(stream$.observed).toBe(false);
  });

  it('schedules a setImmediate that throws the wrapped exception', () => {
    const captured: Array<() => void> = [];
    jest.spyOn(global, 'setImmediate').mockImplementation(((cb: () => void) => {
      captured.push(cb);
      return 0 as any;
    }) as any);

    const svc = new ReadStateExceptionHandlerService(unhandledExceptionBus);
    svc.onModuleInit();

    const exception = new Error('boom');
    stream$.next({ cause: { id: 'fake-event' } as any, exception });

    expect(captured).toHaveLength(1);
    expect(() => captured[0]!()).toThrow('boom');
  });

  it('wraps non-Error exceptions in an Error before throwing', () => {
    const captured: Array<() => void> = [];
    jest.spyOn(global, 'setImmediate').mockImplementation(((cb: () => void) => {
      captured.push(cb);
      return 0 as any;
    }) as any);

    const svc = new ReadStateExceptionHandlerService(unhandledExceptionBus);
    svc.onModuleInit();
    stream$.next({ cause: {} as any, exception: 'a string error' });

    expect(captured).toHaveLength(1);
    expect(() => captured[0]!()).toThrow('a string error');
  });

  it('handles missing subscription gracefully on destroy', () => {
    const svc = new ReadStateExceptionHandlerService(unhandledExceptionBus);
    // Calling destroy without init should not throw.
    expect(() => svc.onModuleDestroy()).not.toThrow();
  });
});
