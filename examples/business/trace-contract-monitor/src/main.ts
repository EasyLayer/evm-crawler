import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { TraceContractMonitor } from './model';
import { GetTraceSummaryQueryHandler, GetRecentTracesQueryHandler } from './query';

config();

bootstrap({
  Models: [TraceContractMonitor],
  QueryHandlers: [GetTraceSummaryQueryHandler, GetRecentTracesQueryHandler],
})
  .then(() => {
    console.log('\n🚀 Trace Contract Monitor started.\n');
    console.log(`curl -X POST http://localhost:3000/query \\
  -H "Content-Type: application/json" \\
  -d '{"name":"GetTraceSummaryQuery","dto":{}}'\n`);
    console.log(`curl -X POST http://localhost:3000/query \\
  -H "Content-Type: application/json" \\
  -d '{"name":"GetRecentTracesQuery","dto":{}}'\n`);
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start Trace Contract Monitor:', error);
  });
