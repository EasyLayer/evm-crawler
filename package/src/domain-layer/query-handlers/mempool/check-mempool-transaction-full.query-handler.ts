import { Injectable } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import { CheckMempoolTransactionFullQuery } from '@easylayer/evm';
import type { CheckMempoolTransactionFullResult } from '@easylayer/evm';
import { MempoolReadService } from '../../services';

@Injectable()
@QueryHandler(CheckMempoolTransactionFullQuery)
export class CheckMempoolTransactionFullQueryHandler
  implements IQueryHandler<CheckMempoolTransactionFullQuery, CheckMempoolTransactionFullResult>
{
  constructor(private readonly mempoolReadService: MempoolReadService) {}

  async execute({ payload }: CheckMempoolTransactionFullQuery): Promise<CheckMempoolTransactionFullResult> {
    const { hash, includeMetadata = false } = payload;
    const exists = await this.mempoolReadService.hasTransaction(hash);
    const isLoaded = exists ? await this.mempoolReadService.isTransactionLoaded(hash) : false;
    const metadata = includeMetadata && exists ? await this.mempoolReadService.getTransactionMetadata(hash) : undefined;

    return {
      hash,
      exists,
      isLoaded,
      metadata,
    };
  }
}
