export { bootstrap } from './bootstrap';
export { ContainerModule } from './container.module';
export { AppModule } from './app.module';
export type { AppModuleOptions } from './app.module';
export type { ContainerModuleOptions } from './container.module';
// Re-export user-facing framework symbols for convenience in node context
export { Model, defineModel, normalizeModelsEVM } from '../domain-layer/framework';
export type { ProcessBlockExecutionContext, ModelInput } from '../domain-layer/framework';
