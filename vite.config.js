import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// One name for the bundle AND for the source maps uploaded against it. If
// those two ever disagree, Sentry has maps it cannot match to the code that
// threw and every stack trace stays minified — the single commonest way this
// setup silently stops being worth anything. Vercel and GitHub Actions both
// hand us the commit SHA; a build off neither has no meaningful release and
// says so rather than inventing one.
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'dev';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Switched from the default generateSW strategy to injectManifest:
      // push notifications need a service worker that runs OUR code
      // (Firebase Messaging's background handler in src/sw.js), which
      // generateSW's auto-generated worker has no room for.
      // injectManifest compiles src/sw.js as the actual service worker,
      // injecting the offline precache list into it (the same app-shell
      // caching generateSW used to set up automatically) rather than
      // generating a worker from scratch.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      // The default injected registration script is a dumb one-liner
      // (`navigator.serviceWorker.register('/sw.js')`) with NO update
      // detection wired up — `registerType: 'autoUpdate'` above does
      // nothing on its own unless something actually calls the richer
      // `registerSW()` helper from the `virtual:pwa-register` module. Set
      // to null so main.jsx can import and call that itself (see there for
      // why this matters: without it, an already-open tab/installed PWA
      // that updates in the background — sw.js calls skipWaiting() +
      // clients.claim() unconditionally — silently ends up running old
      // page JS under a new service worker whose precache no longer has
      // the old-hashed asset files. Found live: a stale build kept
      // rendering the removed "Kid Goat" tier, and is the leading
      // suspect for reports of the app going blank/crashing on iPhone.
      injectRegister: null,
      // Lets `npm run dev` also serve the manifest + service worker, so you
      // can test "Add to Home Screen" (and push) without a full build first.
      // type: 'module' is required in dev for injectManifest, since
      // src/sw.js uses ES module imports.
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Jimmy the Goat',
        short_name: 'Jimmy Goat',
        description: 'A fast, no-nonsense strength tracker for the gym.',
        // The brand gray — the colour the OS paints around the app (status
        // bar, splash). Twinned with the theme-color meta in index.html,
        // which the browser reads first.
        theme_color: '#333333',
        background_color: '#333333',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // One file for every icon slot — the brand logo, 512x512 and
        // opaque, the same file index.html uses for the favicon, the
        // Apple touch icon and the launch screen. Listed twice on purpose:
        // `any` is the plain launcher/install icon, `maskable` lets
        // Android crop it to its adaptive shape (the goat sits well inside
        // the safe zone, and the ground bleeds to every edge, so the same
        // pixels serve both). Chrome's install criteria want one icon of
        // at least 192px with purpose `any`; a 512 covers that and the
        // Android splash.
        icons: [
          { src: '/newlogo.zozo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/newlogo.zozo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Cache the app shell so it still opens (with whatever data is
        // already in LocalStorage/Firestore's own offline cache) if the
        // phone loses signal.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // NOT the outfit sets (public/assets/outfits — 12 files, ~2.6MB):
        // a bought cosmetic for one character, fetched the first time it
        // is drawn and held by the browser's own cache after that, the
        // same footing as the dance clips. Offline before that first
        // draw, the avatar falls back to the plain tier sprite, which IS
        // precached (JimmyAvatar / JimmyAnimation). The node_modules
        // entry is workbox's own default, restated because setting the
        // option replaces it.
        // '**/*.map' is belt and braces: globPatterns above already lists
        // extensions and a .map file matches none of them. It is here so
        // that widening globPatterns later cannot quietly start shipping
        // every source map into the offline precache of every install.
        globIgnores: ['**/node_modules/**/*', '**/assets/outfits/**', '**/*.map'],
      },
    }),
    // Last in the list so it sees the finished bundle. Does nothing at all
    // without SENTRY_AUTH_TOKEN — deliberately NOT VITE_-prefixed, because
    // Vite inlines every VITE_ variable into the client bundle and this one
    // is a secret. No token means no upload and no failure, so a clone of
    // this repo still builds.
    //
    // The slugs are overridable because Sentry's project slug is whatever
    // the console was clicked through with, and it is not always the one you
    // would guess — check Settings → Projects and set SENTRY_PROJECT if it
    // differs from the default below.
    sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? 'jimmy-the-goat',
      project: process.env.SENTRY_PROJECT ?? 'jimmy-the-goat',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: release },
      // Uploaded, then deleted from dist. `sourcemap: 'hidden'` below
      // already stops anything pointing a visitor at them; this stops them
      // being on the server to find at all.
      sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
      disable: !process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
    }),
  ],
  define: {
    // The release name has to reach client code, and only VITE_-prefixed
    // keys do. Injected here rather than kept in an .env file so it cannot
    // drift from the value the plugin above uploads under.
    'import.meta.env.VITE_RELEASE': JSON.stringify(release),
  },
  build: {
    // Maps are built only when there is a token to upload them with, and the
    // plugin above deletes them from dist the moment it has. Tied together on
    // purpose: a map nothing collects is not a debugging aid, it is the whole
    // source sitting on the CDN at a guessable URL. A build without the token
    // — a clone, a local `npm run build` — emits exactly what it did before
    // any of this was added.
    //
    // 'hidden' rather than true: the maps exist for the upload but no
    // //# sourceMappingURL comment goes into the bundle, so nothing points a
    // visitor at them in the window before they are deleted.
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false,
    rollupOptions: {
      output: {
        // Split the two big, slow-changing vendor groups out of the app
        // chunk. This doesn't cut total bytes on a first visit — Firebase
        // Auth + Firestore (with the offline cache) genuinely have to load
        // before the logged-in landing screen can render — but it does:
        //   - let the browser pull all three in parallel over HTTP/2
        //   - keep the ~600KB Firebase chunk and the React chunk BYTE-FOR-
        //     BYTE identical across app redeploys, so a returning user
        //     re-downloads only the small app chunk that actually changed
        //   - make the 500KB "large chunk" warning mean something per group
        // recharts and its d3 deps are deliberately NOT listed: they're
        // only reached from the already-lazy /progress route, so leaving
        // them unassigned keeps them in that route's own chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Let firebase/messaging stay its own dynamic-import chunk (it's
          // pulled in only by the push flow — see lib/firebase.js's
          // getMessagingInstance); folding it into `firebase` here would
          // undo that and drag ~10KB gzip of FCM code into every visit.
          if (id.includes('/@firebase/messaging') || id.includes('/firebase/messaging')) {
            return undefined;
          }
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
