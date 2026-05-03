import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/evm-crawler';
import { Erc20TransferMonitor } from './model';
export class GetContractSummaryQuery {}
@QueryHandler(GetContractSummaryQuery)
export class GetContractSummaryQueryHandler implements IQueryHandler<GetContractSummaryQuery> { constructor(private readonly modelFactory: ModelFactoryService) {} public async execute(): Promise<any> { const model = await this.modelFactory.restoreByCtor(Erc20TransferMonitor); return model.getContractSummary(); } }
export class GetRecentTransfersQuery {}
@QueryHandler(GetRecentTransfersQuery)
export class GetRecentTransfersQueryHandler implements IQueryHandler<GetRecentTransfersQuery> { constructor(private readonly modelFactory: ModelFactoryService) {} public async execute(): Promise<any> { const model = await this.modelFactory.restoreByCtor(Erc20TransferMonitor); return model.getRecentTransfers(); } }
