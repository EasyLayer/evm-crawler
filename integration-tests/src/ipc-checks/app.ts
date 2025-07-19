import { bootstrap } from '@easylayer/evm-crawler';
import BlockModel, { AGGREGATE_ID } from './blocks.model';

async function start() {
  await bootstrap({
    Models: [BlockModel],
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
