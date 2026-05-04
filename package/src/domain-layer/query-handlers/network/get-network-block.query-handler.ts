import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkBlockQuery } from '@easylayer/evm';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkBlockQuery)
export class GetNetworkBlockQueryHandler implements IQueryHandler<GetNetworkBlockQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkBlockQuery) {
    return this.networkModelFactory.getBlock(payload.height);
  }
}
