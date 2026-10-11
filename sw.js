const VERSION = 'damas-v1';
const CACHE = VERSION;

// Archivos locales (todos en la raíz)
const CORE = ['./', './index.html', './manifest.json'];
const OPTIONAL = ['./icon-192.png', './icon-512.png'];

// Recursos externos que usa el diseño (Tailwind CDN + Google Fonts)
const TAILWIND = 'https://cdn.tailwindcss.com';
const FONT_CSS = [
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
];

async function cacheFontCss(cache, url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) return;
  await cache.put(url, res.clone());
  const css = await res.text();
  const files = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/["']/g, ''));
  await Promise.allSettled(files.map(async f => {
    if (await cache.match(f)) return;
    const r = await fetch(f, { mode: 'cors' });
    if (r.ok) await cache.put(f, r);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.allSettled([
      ...OPTIONAL.map(u => cache.add(u)),
      fetch(TAILWIND, { mode: 'no-cors' }).then(r => cache.put(TAILWIND, r)),
      ...FONT_CSS.map(u => cacheFontCss(cache, u))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  // Mismo origen: red primero (para recibir actualizaciones), caché como respaldo
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const home = await cache.match('./index.html');
          if (home) return home;
        }
        throw err;
      }
    })());
    return;
  }

  // Externos (Tailwind, fuentes): caché primero, y se guarda lo que se vaya pidiendo
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
