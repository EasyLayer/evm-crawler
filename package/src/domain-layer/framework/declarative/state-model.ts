import { Model } from '@easylayer/common/framework';
import type { AggregateOptions } from '@easylayer/common/cqrs';

export abstract class StateModel<State> extends Model {
  public state: State;

  static snapshotFieldAdapters?: Record<string, { toJSON(v: any): any; fromJSON(raw: any): any }>;

  constructor(aggregateId: string, lastBlockHeight: number, options?: AggregateOptions) {
    super(aggregateId, lastBlockHeight, {
      ...options,
      snapshotAdapters: {
        ...(options?.snapshotAdapters ?? {}),
      },
    });

    const init = options?.initialState;
    this.state = typeof init === 'function' ? (init as () => State)() : init ?? ({} as State);
  }

  protected serializeUserState(): Record<string, any> {
    return {};
  }

  protected restoreUserState(revived: any): void {
    if (Object.prototype.hasOwnProperty.call(revived ?? {}, 'state')) {
      this.state = revived.state as State;
    }
  }
}
