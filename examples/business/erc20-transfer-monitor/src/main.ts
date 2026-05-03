import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { Erc20TransferMonitor } from './model';
import { GetContractSummaryQueryHandler, GetRecentTransfersQueryHandler } from './query';

config();

bootstrap({
  Models: [Erc20TransferMonitor],
  QueryHandlers: [GetContractSummaryQueryHandler, GetRecentTransfersQueryHandler],
})
  .then(() => {
    console.log('\n🚀 ERC20 Transfer Monitor started.\n');
    console.log(`curl -X POST http://localhost:3000/query \\
  -H "Content-Type: application/json" \\
  -d '{"name":"GetContractSummaryQuery","dto":{}}'\n`);
    console.log(`curl -X POST http://localhost:3000/query \\
  -H "Content-Type: application/json" \\
  -d '{"name":"GetRecentTransfersQuery","dto":{}}'\n`);
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start ERC20 Transfer Monitor:', error);
  });
