import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { UnhandledExceptionBus, IEvent } from '@easylayer/common/cqrs';

interface UnhandledExceptionEvent {
  cause: IEvent;
  exception: any;
}

@Injectable()
export class ReadStateExceptionHandlerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ReadStateExceptionHandlerService.name);
  private subscription!: Subscription;

  constructor(private readonly unhandledExceptionBus: UnhandledExceptionBus) {}

  onModuleInit() {
    this.subscription = this.unhandledExceptionBus.stream$.subscribe((error: UnhandledExceptionEvent) => {
      this.log.error('Read State Unhandled Exception');

      // IMPORTANT: If there is an error in the EventHandler (read state update),
      // crash the application so Docker restarts it and idempotent events
      // are replayed from the EventStore, guaranteeing read state consistency.
      setImmediate(() => {
        throw error.exception instanceof Error ? error.exception : new Error(String(error.exception));
      });
    });
  }

  onModuleDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
