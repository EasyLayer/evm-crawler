import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { NativeBalanceWatcher } from './model';
import { GetBalanceQueryHandler } from './query';

config();

bootstrap({
  Models: [NativeBalanceWatcher],
  QueryHandlers: [GetBalanceQueryHandler],
})
  .then(() => {
    console.log('\n🚀 EVM Native Balance Watcher started.\n');
    console.log('Tracked addresses come from WATCH_ADDRESSES.');
    console.log('Balances are stored in wei as decimal strings.');
    console.log('\nExample queries:');
    console.log(`curl -X POST http://localhost:3000/query \\
  -H "Content-Type: application/json" \\
  -d '{"name":"GetBalanceQuery","dto":{"addresses":[]}}'\n`);
    console.log(`curl -X POST http://localhost:3000/query \\
  -H "Content-Type: application/json" \\
  -d '{"name":"FetchEventsQuery","dto":{"modelIds":["native-balance-watcher"],"filter":{},"paging":{"limit":10}}}'\n`);
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start EVM Native Balance Watcher:', error);
  });
