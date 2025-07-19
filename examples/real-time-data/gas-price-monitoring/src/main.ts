import { bootstrap } from '@easylayer/evm-crawler';
import GasMetricsModel from './models';

bootstrap({
  Models: [GasMetricsModel],
}).catch((error: Error) => console.error(error));