import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkBlocksQuery } from '@easylayer/evm';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkBlocksQuery)
export class GetNetworkBlocksQueryHandler implements IQueryHandler<GetNetworkBlocksQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkBlocksQuery) {
    const { lastN, all = false } = payload;
    return this.networkModelFactory.getBlocks(lastN, all);
  }
}
