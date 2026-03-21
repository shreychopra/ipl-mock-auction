const CACHE = 'ipl-v2';
const STATIC = ['./index.html', './fantasy.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(STATIC); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;
  // Never intercept navigation requests - let browser handle page transitions
  if(e.request.mode === 'navigate') return;
  // Never intercept Firebase or API calls
  if(url.includes('firebase') || url.includes('workers.dev') || url.includes('googleapis')) return;
  // Cache-first for images
  if(url.includes('/images/')){
    e.respondWith(
      caches.match(e.request).then(function(cached){
        return cached || fetch(e.request).then(function(resp){
          caches.open(CACHE).then(function(c){ c.put(e.request, resp.clone()); });
          return resp;
        });
      })
    );
  }
});
