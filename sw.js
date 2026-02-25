/**
 * ============================================================
 * SERVICE WORKER — Le Gardien des Graines
 * Stratégie : Cache-first pour les assets, Network-first pour les données
 * ============================================================
 */

const CACHE_NAME = 'gardien-graines-v3';

// Assets à mettre en cache au premier chargement
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js'
];

// ---- INSTALLATION : mise en cache initiale ----
self.addEventListener('install', event => {
  console.log('[SW] Installation v3...');
  self.skipWaiting(); // prend le contrôle immédiatement sans attendre
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des assets');
        // On cache les assets locaux en priorité, les CDN en best-effort
        return cache.addAll(['./index.html', './manifest.json'])
          .then(() => {
            // CDN en best-effort (pas bloquant si hors-ligne à l'install)
            return Promise.allSettled(
              ASSETS_TO_CACHE.filter(u => u.startsWith('http')).map(url =>
                fetch(url).then(r => cache.put(url, r)).catch(() => {})
              )
            );
          });
      })
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATION : nettoyage des anciens caches ----
self.addEventListener('activate', event => {
  console.log('[SW] Activation');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Suppression ancien cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH : stratégie selon le type de requête ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requêtes GitHub API → toujours réseau
  if (url.hostname === 'api.github.com') {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({ error: 'Hors-ligne' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // index.html → Network-first : toujours essayer le réseau pour avoir les mises à jour
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Tous les autres assets (CSS, JS, fonts CDN) → Cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => null);
    })
  );
});

// ---- MESSAGE : forcer mise à jour du cache ----
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
