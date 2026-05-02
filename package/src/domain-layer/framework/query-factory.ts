import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import type { ModelFactoryService } from '.';

// ── Public API ────────────────────────────────────────────────────────────────

export interface QueryFactoryServices {
  modelFactory: ModelFactoryService;
}

export interface QueryHandlerFactory<TDto = any, TResult = any> {
  queryName: string;
  handle: (dto: TDto, services: QueryFactoryServices) => Promise<TResult>;
}

export type QueryHandlerInput = (new (...args: any[]) => IQueryHandler) | QueryHandlerFactory;

// ── Internal adapter ──────────────────────────────────────────────────────────

export function buildQueryHandlerClass(
  factory: QueryHandlerFactory,
  getServices: () => QueryFactoryServices
): new () => IQueryHandler {
  const QueryClass = class {};
  Object.defineProperty(QueryClass, 'name', {
    value: factory.queryName,
    configurable: true,
  });

  @QueryHandler(QueryClass as any)
  class FactoryQueryHandler implements IQueryHandler {
    async execute(query: any): Promise<any> {
      return factory.handle(query, getServices());
    }
  }

  Object.defineProperty(FactoryQueryHandler, 'name', {
    value: `${factory.queryName}FactoryHandler`,
    configurable: true,
  });

  return FactoryQueryHandler;
}

export function splitQueryHandlers(handlers: QueryHandlerInput[]): {
  classHandlers: Array<new (...args: any[]) => IQueryHandler>;
  factories: QueryHandlerFactory[];
} {
  const classHandlers: Array<new (...args: any[]) => IQueryHandler> = [];
  const factories: QueryHandlerFactory[] = [];

  for (const h of handlers) {
    if (typeof h === 'function') {
      classHandlers.push(h as new (...args: any[]) => IQueryHandler);
    } else {
      factories.push(h as QueryHandlerFactory);
    }
  }

  return { classHandlers, factories };
}
