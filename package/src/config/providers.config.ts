import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

const parseUrls = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
};

export interface MempoolProviderConnection {
  httpUrl?: string;
  wsUrl?: string;
}

@Injectable()
export class ProvidersConfig {
  @Transform(({ value }) => value || 'ethersjs')
  @IsString()
  @JSONSchema({ description: 'Provider type: ethersjs | web3js', enum: ['ethersjs', 'web3js'] })
  PROVIDER_TYPE: 'ethersjs' | 'web3js' = 'ethersjs';

  @Transform(({ value }) => parseUrls(value))
  @IsOptional()
  @JSONSchema({ description: 'Network RPC HTTP URLs (comma-separated)' })
  PROVIDER_NETWORK_RPC_URLS?: string[];

  @Transform(({ value }) => parseUrls(value))
  @IsOptional()
  @JSONSchema({ description: 'Network WebSocket URLs (comma-separated). Required for subscribe-ws block strategy.' })
  PROVIDER_NETWORK_WS_URLS?: string[];

  /**
   * Mempool RPC HTTP URLs.
   * Required for MEMPOOL_LOADER_STRATEGY_NAME=txpool-content.
   */
  @Transform(({ value }) => parseUrls(value))
  @IsOptional()
  @JSONSchema({ description: 'Mempool RPC HTTP URLs (comma-separated). Enables txpool-content mempool tracking.' })
  PROVIDER_MEMPOOL_RPC_URLS?: string[];

  /**
   * Mempool WebSocket URLs.
   * Required for MEMPOOL_LOADER_STRATEGY_NAME=subscribe-ws.
   */
  @Transform(({ value }) => parseUrls(value))
  @IsOptional()
  @JSONSchema({ description: 'Mempool WebSocket URLs (comma-separated). Enables subscribe-ws mempool tracking.' })
  PROVIDER_MEMPOOL_WS_URLS?: string[];

  @Transform(({ value }) => parseInt(value, 10) || 1000)
  @IsNumber()
  @JSONSchema({ description: 'Maximum batch size for RPC requests.' })
  PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE: number = 1000;

  @Transform(({ value }) => parseInt(value, 10) || 1)
  @IsNumber()
  @JSONSchema({ description: 'Maximum concurrent RPC requests.' })
  PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS: number = 1;

  @Transform(({ value }) => parseInt(value, 10) || 1000)
  @IsNumber()
  @JSONSchema({ description: 'Delay between RPC request batches in milliseconds.' })
  PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS: number = 1000;

  getRateLimits() {
    return {
      maxConcurrentRequests: this.PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS,
      maxBatchSize: this.PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE,
      requestDelayMs: this.PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS,
    };
  }

  getNetworkConnections(): Array<{ httpUrl: string; wsUrl?: string }> {
    const httpUrls = this.PROVIDER_NETWORK_RPC_URLS || [];
    const wsUrls = this.PROVIDER_NETWORK_WS_URLS || [];

    // WS URL requires a paired RPC URL at the same index — WS cannot fetch
    // blocks/receipts independently, it only subscribes to new block events.
    if (wsUrls.length > 0 && httpUrls.length === 0) {
      throw new Error(
        'PROVIDER_NETWORK_WS_URLS requires at least one PROVIDER_NETWORK_RPC_URLS. ' +
          'WS is used for real-time block notifications; RPC is required for block/receipt fetching.'
      );
    }

    return httpUrls.map((httpUrl, i) => ({
      httpUrl,
      wsUrl: wsUrls[i], // undefined if no WS url at this index
    }));
  }

  hasMempoolProviders(): boolean {
    return (this.PROVIDER_MEMPOOL_RPC_URLS?.length ?? 0) > 0 || (this.PROVIDER_MEMPOOL_WS_URLS?.length ?? 0) > 0;
  }

  getMempoolConnections(): MempoolProviderConnection[] {
    const httpUrls = this.PROVIDER_MEMPOOL_RPC_URLS || [];
    const wsUrls = this.PROVIDER_MEMPOOL_WS_URLS || [];
    const count = Math.max(httpUrls.length, wsUrls.length);

    return Array.from({ length: count }, (_, index) => ({
      httpUrl: httpUrls[index],
      wsUrl: wsUrls[index],
    })).filter((connection) => Boolean(connection.httpUrl || connection.wsUrl));
  }
}
