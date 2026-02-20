const CACHE = "detroitriverjigger-static-20260220223726";
const ASSETS = ["./","./index.html","./app.js","./manifest.json"];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener("activate",(e)=>{e.waitUntil((async ()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener("fetch",(e)=>{
  const url = new URL(e.request.url);
  if (url.pathname.endsWith("")) {
    // network first for live data
    e.respondWith(fetch(e.request).catch(()=>caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
