import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const chainstackTarget = env.CHAINSTACK_RPC_TARGET || 'https://ethereum-mainnet.core.chainstack.com';
  const chainstackUsername = env.CHAINSTACK_RPC_USERNAME || ''; const chainstackPassword = env.CHAINSTACK_RPC_PASSWORD || '';
  return {
    resolve: { conditions: ['browser', 'module', 'default'], mainFields: ['browser', 'module', 'main'] },
    build: { outDir: 'dist', emptyOutDir: false, rollupOptions: { input: 'index.html' } },
    preview: { port: 4173 },
    server: { port: 4173, proxy: { '/rpc': { target: chainstackTarget, changeOrigin: true, rewrite: (path) => path.replace(/^\/rpc/, ''), ...(chainstackUsername && chainstackPassword ? { auth: `${chainstackUsername}:${chainstackPassword}` } : {}) } } },
  };
});
