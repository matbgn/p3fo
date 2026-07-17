import { defineConfig, loadEnv } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));

const patchYProsemirrorCursors = () => ({
  name: "patch-y-prosemirror-cursors",
  transform(code: string, id: string) {
    if (id.includes("y-prosemirror") && id.includes("cursor-plugin")) {
      // Guard Y.createRelativePositionFromJSON calls against undefined/null
      // to prevent crash when awareness cursor state has invalid shape
      return code.replace(
        /Y\.createRelativePositionFromJSON\(aw\.cursor\.anchor\)/g,
        "Y.createRelativePositionFromJSON(aw.cursor.anchor == null ? {type:null,tname:null,item:null,assoc:0} : aw.cursor.anchor)"
      ).replace(
        /Y\.createRelativePositionFromJSON\(aw\.cursor\.head\)/g,
        "Y.createRelativePositionFromJSON(aw.cursor.head == null ? {type:null,tname:null,item:null,assoc:0} : aw.cursor.head)"
      ).replace(
        /Y\.createRelativePositionFromJSON\(current\.cursor\.anchor\)/g,
        "Y.createRelativePositionFromJSON(current.cursor.anchor == null ? {type:null,tname:null,item:null,assoc:0} : current.cursor.anchor)"
      ).replace(
        /Y\.createRelativePositionFromJSON\(current\.cursor\.head\)/g,
        "Y.createRelativePositionFromJSON(current.cursor.head == null ? {type:null,tname:null,item:null,assoc:0} : current.cursor.head)"
      );
    }
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: env.VITE_BASE_URL || '/',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      patchYProsemirrorCursors(),
      react(),
      dyadComponentTagger(),
      mode === 'analyze' && visualizer({ open: false, filename: 'bundle-stats.html', gzipSize: true }),
    ].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          // Avoid manual chunk splitting for React-based packages to prevent circular
          // module dependencies in the production build. Rollup/Vite will still
          // automatically code-split lazy-loaded dynamic imports.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            // Keep React + react-dom + react-router together to avoid circular deps
            if (id.includes('node_modules/react-router') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) {
              return 'react-vendor';
            }
            // Yjs CRDT engine — large, stable, rarely changes → cacheable
            if (id.includes('node_modules/yjs') || id.includes('node_modules/y-protocols') || id.includes('node_modules/y-websocket') || id.includes('node_modules/lib0')) {
              return 'yjs-vendor';
            }
            // D3 + recharts charting libs — heavy, only used by metrics/circles
            if (id.includes('node_modules/d3') || id.includes('node_modules/recharts') || id.includes('node_modules/victory') || id.includes('node_modules/d3-array') || id.includes('node_modules/d3-scale')) {
              return 'charts-vendor';
            }
            // Calendar libs — heavy, only used by timetable view
            if (id.includes('node_modules/react-big-calendar') || id.includes('node_modules/moment') || id.includes('node_modules/date-fns')) {
              return 'calendar-vendor';
            }
            // OpenTelemetry SDK — only loaded when VITE_OTEL_ENABLED=true
            if (id.includes('node_modules/@opentelemetry')) {
              return 'otel-vendor';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: true, // This makes the dev server listen on all network interfaces
      sourcemapIgnoreList(sourcePath) {
        return sourcePath.includes('node_modules');
      },
      allowedHosts: env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [],
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
        usePolling: true,
      },
      proxy: {
        '/ws': {
          target: process.env.WS_TARGET || 'ws://localhost:5172',
          ws: true,
          rewrite: (path) => path.replace(/^\/ws/, ''),
        },
        '/api': {
          target: process.env.API_TARGET || 'http://localhost:5172',
          changeOrigin: true,
        },
        '/v1/traces': {
          target: process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318',
          changeOrigin: true,
          rewrite: (path) => path,
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
