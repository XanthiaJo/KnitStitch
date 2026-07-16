// vite.config.js
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

/**
 * Vite plugin for build-time HTML includes.
 *
 * Processes <!-- #include file="partials/header.html" --> directives in
 * HTML entry points, inlining the referenced file content at both dev
 * and build time. Supports nested includes (partials that include other
 * partials) up to a depth of 10. Paths are resolved relative to the
 * project root.
 */
function htmlIncludes() {
  const root = process.cwd();
  const includeRegex = /<!--\s*#include\s+file="([^"]+)"\s*-->/g;

  function processIncludes(html, depth = 0) {
    if (depth > 10) return html;
    return html.replace(includeRegex, (match, filePath) => {
      const fullPath = isAbsolute(filePath)
        ? resolve(root, filePath.slice(1))
        : resolve(root, filePath);
      try {
        const content = readFileSync(fullPath, 'utf-8');
        return processIncludes(content, depth + 1);
      } catch (e) {
        console.error(`[html-includes] Failed to include "${filePath}": ${e.message}`);
        return match;
      }
    });
  }

  return {
    name: 'html-includes',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return processIncludes(html);
      },
    },
  };
}

export default {
  base: '/',
  root: '.',
  plugins: [htmlIncludes()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0, // Keep Konva as external chunk
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        changelog: resolve(__dirname, 'pages/changelog.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
};
