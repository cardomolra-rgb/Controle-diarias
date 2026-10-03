/* Service worker: guarda o app no celular para abrir sem internet.
   Ao publicar uma nova versão, aumente VERSAO para o celular baixar os arquivos novos. */
const VERSAO = 'diarias-v1';
const APP = ['./', 'index.html', 'js/app.js', 'js/config.js', 'js/supabase.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const FONTES = 'diarias-fontes';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== FONTES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // dados e login do Supabase nunca passam pelo cache
  if (url.hostname.endsWith('.supabase.co')) return;
  // fontes do Google: usa a cópia guardada e atualiza em segundo plano
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTES).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // abrir o app: tenta a rede rapidinho, senão usa a versão guardada
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(VERSAO);
      try {
        const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 3500))]);
        if (r.ok) c.put('index.html', r.clone());
        return r;
      } catch (err) {
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  // demais arquivos do app: cópia guardada primeiro, atualiza em segundo plano
  e.respondWith(caches.open(VERSAO).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
