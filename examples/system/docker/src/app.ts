import { config } from 'dotenv';
import { bootstrap } from '@easylayer/evm-crawler';
import { NativeBalanceWatcher } from './model';
import { GetBalanceQueryHandler } from './query';
config();
(async () => {
  await bootstrap({ Models: [NativeBalanceWatcher], QueryHandlers: [GetBalanceQueryHandler] });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
