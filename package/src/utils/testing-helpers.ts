import type { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { INestApplicationContext } from '@nestjs/common';
import { EventBus } from '@easylayer/common/cqrs';

export interface EventWaiter<T = any> {
  eventType: new (...args: any[]) => T;
  count: number;
}

export interface TestingOptions {
  handlerEventsToWait?: EventWaiter[];
  sagaEventsToWait?: EventWaiter[];
}

export function createCompletionPromise<E>(
  stream$: Observable<E>,
  EventClass: new (...args: any[]) => E,
  expectedCount: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let seen = 0;
    const targetName = EventClass.name;
    const sub = stream$.pipe(filter((ev: any) => ev?.constructor?.name === targetName)).subscribe({
      next: () => {
        if (++seen >= expectedCount) {
          sub.unsubscribe();
          resolve();
        }
      },
      error: (err) => {
        sub.unsubscribe();
        reject(err);
      },
    });
  });
}

export function createCompletionPromises<E>(stream$: Observable<E>, waiters?: EventWaiter<E>[]): Promise<void>[] {
  return waiters?.filter((w) => w.count > 0).map((w) => createCompletionPromise(stream$, w.eventType, w.count)) || [];
}

export function setupTestEventSubscribers(app: INestApplicationContext, testing: TestingOptions): Promise<void>[] {
  const eventBus = app.get<EventBus>(EventBus);
  const promises: Promise<void>[] = [];
  if (testing.handlerEventsToWait?.length) {
    promises.push(...createCompletionPromises(eventBus.eventHandlerCompletion$, testing.handlerEventsToWait));
  }
  if (testing.sagaEventsToWait?.length) {
    promises.push(...createCompletionPromises(eventBus.sagaCompletion$, testing.sagaEventsToWait));
  }
  return promises;
}
