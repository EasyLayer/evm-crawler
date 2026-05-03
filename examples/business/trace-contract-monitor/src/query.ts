import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/evm-crawler';
import { TraceContractMonitor } from './model';
export class GetTraceSummaryQuery {}
@QueryHandler(GetTraceSummaryQuery)
export class GetTraceSummaryQueryHandler implements IQueryHandler<GetTraceSummaryQuery> { constructor(private readonly modelFactory: ModelFactoryService) {} public async execute(): Promise<any> { const model = await this.modelFactory.restoreByCtor(TraceContractMonitor); return model.getTraceSummary(); } }
export class GetRecentTracesQuery {}
@QueryHandler(GetRecentTracesQuery)
export class GetRecentTracesQueryHandler implements IQueryHandler<GetRecentTracesQuery> { constructor(private readonly modelFactory: ModelFactoryService) {} public async execute(): Promise<any> { const model = await this.modelFactory.restoreByCtor(TraceContractMonitor); return model.getRecentTraces(); } }
