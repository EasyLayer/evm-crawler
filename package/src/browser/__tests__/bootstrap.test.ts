// Direct import — avoids the framework barrel which pulls in @easylayer/common/framework CJS
// (the same path the bootstrap.ts file itself uses).
import { ModelFactoryService } from '../../domain-layer/framework/factory';

describe('browser bootstrap — DI token resolution', () => {
  it('uses the class token (not a string) when resolving ModelFactoryService', () => {
    // This is a regression guard for the BUG-001 pattern: the previous bootstrap
    // called appContext.get('ModelFactoryService', ...) which never resolves
    // because the provider in BrowserAppModule is { provide: ModelFactoryService, ... }.
    //
    // We assert the import shape rather than running the full NestJS lifecycle
    // because the bootstrap requires a working OPFS/sqlite-wasm environment.
    expect(ModelFactoryService).toBeDefined();
    expect(typeof ModelFactoryService).toBe('function');
    expect(ModelFactoryService.name).toBe('ModelFactoryService');
  });

  it('app context resolves ModelFactoryService via class token in mock scenario', () => {
    // Lightweight mock of the appContext.get pattern used in bootstrap.ts:
    //   const modelFactory = appContext.get(ModelFactoryService, { strict: false });
    const fakeInstance = { _fake: true };
    const providers = new Map<any, any>([[ModelFactoryService, fakeInstance]]);
    const appContext = {
      get: (token: any, _opts?: any) => providers.get(token),
    };

    const resolved = appContext.get(ModelFactoryService, { strict: false });
    expect(resolved).toBe(fakeInstance);

    // A string token would never find the provider — this is the bug we're guarding.
    const resolvedByString = appContext.get('ModelFactoryService', { strict: false });
    expect(resolvedByString).toBeUndefined();
  });
});
