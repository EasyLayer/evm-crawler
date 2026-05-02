import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkLastBlockQuery } from '@easylayer/evm';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkLastBlockQuery)
export class GetNetworkLastBlockQueryHandler implements IQueryHandler<GetNetworkLastBlockQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute(_: GetNetworkLastBlockQuery) {
    return this.networkModelFactory.getLastBlock();
  }
}
