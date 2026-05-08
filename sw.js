/* Safe & Ruang · Service Worker v13
   - App shell: cache-first
   - Map tiles: stale-while-revalidate
   - Google APIs: never cached
   - HTML: network-first with cache fallback
*/
const SHELL_CACHE = 'sr-shell-v13';
const TILE_CACHE = 'sr-tiles-v1';
const TILE_CACHE_MAX = 200;

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(APP_SHELL).catch(err=>{
      console.warn('Cache addAll partial failure:', err);
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

async function trimCache(cacheName, maxItems){
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems){
    for (let i = 0; i < keys.length - maxItems; i++){
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);

  // Never cache Google APIs / Drive / Sheets — always network
  if (url.hostname.includes('googleapis.com') ||
      url.hostname === 'accounts.google.com' ||
      url.hostname === 'apis.google.com' ||
      url.hostname.includes('gstatic.com') ||
      url.pathname.includes('/drive/') ||
      url.pathname.includes('/sheets/')){
    return;
  }

  // Map tiles: stale-while-revalidate
  if (url.hostname.startsWith('mt0.google.com') ||
      url.hostname.startsWith('mt1.google.com') ||
      url.hostname.startsWith('mt2.google.com') ||
      url.hostname.startsWith('mt3.google.com') ||
      url.hostname.includes('tile.openstreetmap.org')){
    e.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(res => {
            if (res.ok){
              cache.put(e.request, res.clone());
              trimCache(TILE_CACHE, TILE_CACHE_MAX).catch(()=>{});
            }
            return res;
          }).catch(()=>cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Network-first for HTML
  if (e.request.mode === 'navigate' || e.request.destination === 'document'){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for app shell + static assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET'){
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});
