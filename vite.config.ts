import { defineConfig, loadEnv } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: env.BASE_URL || '/',
    plugins: [dyadComponentTagger(), react()],
    server: {
      host: true, // This makes the dev server listen on all network interfaces
      allowedHosts: env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [],
      proxy: {
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
          rewrite: (path) => path.replace(/^\/ws/, ''),
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});

