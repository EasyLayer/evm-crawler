import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { FetchEventsQuery } from '@easylayer/evm';

@Injectable()
@QueryHandler(FetchEventsQuery)
export class FetchEventsQueryHandler implements IQueryHandler<FetchEventsQuery> {
  constructor(private readonly eventStoreService: EventStoreReadService) {}

  async execute({ payload }: FetchEventsQuery): Promise<any> {
    const { modelIds, paging = {}, filter = {}, streaming = false } = payload;
    const options = { ...filter, ...paging };

    if (streaming && typeof (this.eventStoreService as any).streamEventsForManyAggregates === 'function') {
      return (this.eventStoreService as any).streamEventsForManyAggregates(modelIds, options);
    }

    return this.eventStoreService.fetchEventsForManyAggregates(modelIds, options);
  }
}
