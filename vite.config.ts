import { defineConfig, loadEnv } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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
    plugins: [
      patchYProsemirrorCursors(),
      react(),
      dyadComponentTagger(),
    ],
    server: {
      host: true, // This makes the dev server listen on all network interfaces
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
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});