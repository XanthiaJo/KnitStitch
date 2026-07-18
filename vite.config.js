// vite.config.js
import { resolve, dirname, isAbsolute } from 'node:path';
import { readFileSync, rmSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Vite plugin for build-time HTML includes.
 *
 * Processes <!-- #include file="partials/header.html" --> directives in
 * HTML entry points, inlining the referenced file content at both dev
 * and build time. Supports nested includes (partials that include other
 * partials) up to a depth of 10. Relative paths are resolved from the
 * directory of the HTML file that contains the directive; absolute paths
 * (a leading '/') are resolved from the project root.
 */
function htmlIncludes() {
  const includeRegex = /<!--\s*#include\s+file="([^"]+)"\s*-->/g;

  function processIncludes(html, baseDir, depth = 0) {
    if (depth > 10) return html;
    return html.replace(includeRegex, (match, filePath) => {
      const fullPath = isAbsolute(filePath)
        ? resolve(projectRoot, filePath.slice(1))
        : resolve(baseDir, filePath);
      try {
        const content = readFileSync(fullPath, 'utf-8');
        return processIncludes(content, dirname(fullPath), depth + 1);
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
      handler(html, ctx) {
        const baseDir = ctx?.filename ? dirname(ctx.filename) : projectRoot;
        return processIncludes(html, baseDir);
      },
    },
  };
}

/**
 * Vite emits the page HTML files at the outDir root. This moves them
 * into dist/pages/ so that static assets (css, js, wasm, assets, etc.)
 * remain siblings to the pages/ folder in the final build.
 *
 * It leaves other files already in dist/pages/ (e.g. changelog
 * fragments) untouched and removes the stale partials/ directory.
 */
function organisePages() {
  return {
    name: 'organise-pages',
    closeBundle() {
      const outDir = resolve(projectRoot, 'dist');
      const pagesDir = resolve(outDir, 'pages');

      // Ensure the destination directory exists.
      try { mkdirSync(pagesDir, { recursive: true }); } catch {}

      // Remove the stale partials/ source copy; partials are already inlined.
      const partialsDir = resolve(pagesDir, 'partials');
      try { rmSync(partialsDir, { recursive: true, force: true }); } catch {}

      // Replace the source copies of the Vite-built pages with the built versions.
      for (const file of ['index.html', 'readme.html', 'roadmap.html', 'changelog.html', 'small-screen-warning.html']) {
        const src = resolve(outDir, file);
        const dest = resolve(pagesDir, file);
        try { rmSync(dest, { force: true }); } catch {}
        try { renameSync(src, dest); } catch {}
      }
    },
  };
}

export default {
  base: '/',
  root: resolve(projectRoot, 'public/pages'),
  publicDir: resolve(projectRoot, 'public'),
  server: { fs: { allow: [projectRoot] } },
  resolve: {
    alias: {
      '/src': resolve(projectRoot, 'src'),
    },
  },
  plugins: [htmlIncludes(), organisePages()],
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0, // Keep Konva as external chunk
    rollupOptions: {
      input: {
        main: resolve(projectRoot, 'public/pages/index.html'),
        readme: resolve(projectRoot, 'public/pages/readme.html'),
        roadmap: resolve(projectRoot, 'public/pages/roadmap.html'),
        changelog: resolve(projectRoot, 'public/pages/changelog.html'),
        smallScreenWarning: resolve(projectRoot, 'public/pages/small-screen-warning.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
};
