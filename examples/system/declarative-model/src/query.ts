import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/evm-crawler';
import NativeBalanceWatcher from './model';
export class GetBalanceQuery { constructor(public readonly addresses: string[] = []) {} }
@QueryHandler(GetBalanceQuery)
export class GetBalanceQueryHandler implements IQueryHandler<GetBalanceQuery> {
  constructor(private readonly modelFactory: ModelFactoryService) {}
  public async execute({ addresses }: GetBalanceQuery): Promise<Record<string, string>> {
    const model = await this.modelFactory.restoreByCtor(NativeBalanceWatcher);
    if (!addresses.length) return model.getAllBalances();
    const result: Record<string, string> = {};
    for (const address of addresses) result[address] = model.getBalance(address);
    return result;
  }
}
