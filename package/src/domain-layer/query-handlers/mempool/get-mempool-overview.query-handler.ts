import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { GetMempoolOverviewQuery } from '@easylayer/evm';
import { MempoolModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetMempoolOverviewQuery)
export class GetMempoolOverviewQueryHandler implements IQueryHandler<GetMempoolOverviewQuery> {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  async execute(_: GetMempoolOverviewQuery) {
    const model = await this.mempoolModelFactory.initModel();
    return {
      stats: model.getStats(),
      lastUpdatedMs: model.getLastUpdatedMs(),
    };
  }
}
