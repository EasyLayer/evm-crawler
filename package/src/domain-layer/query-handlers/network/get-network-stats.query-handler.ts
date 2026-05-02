import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkStatsQuery } from '@easylayer/evm';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkStatsQuery)
export class GetNetworkStatsQueryHandler implements IQueryHandler<GetNetworkStatsQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute(_: GetNetworkStatsQuery) {
    return this.networkModelFactory.getNetworkStats();
  }
}
