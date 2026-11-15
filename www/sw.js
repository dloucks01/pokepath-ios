/*
 * PokéPath TD - offline service worker (web build only).
 *
 * - Activates right away with nothing cached, then downloads every game file listed in
 *   precache-manifest.json into Cache Storage. The page asks it to continue ("pp-sync")
 *   every launch, so an interrupted download resumes where it stopped.
 * - Files are served cache-first, so after the download the game needs no network.
 * - Range requests (Safari uses them for <audio>) are answered from the cache with 206.
 * - On a new build, unchanged files are copied from the previous cache instead of being
 *   downloaded again; the old cache is deleted once the new one is complete.
 */
const VERSION = 'b55ec6a87a00';
const PREFIX = 'pokepath-';
const CACHE = PREFIX + VERSION;
const MANIFEST_KEY = '__pp_manifest__';
const CONCURRENCY = 6;

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

/* ------------------------------------------------------------------ messaging */
const broadcast = async (msg) => {
	const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
	for (const c of clients) c.postMessage(msg);
};

let syncing = null;
let lastProgress = { done: 0, total: 0 };

self.addEventListener('message', (event) => {
	const type = event.data && event.data.type;
	if (type === 'pp-status' || type === 'pp-sync') {
		if (!syncing) syncing = syncAll().finally(() => { syncing = null; });
		event.waitUntil(syncing);
	}
});

/* ------------------------------------------------------------------ download */
const fetchWithRetry = async (url, tries = 4) => {
	let lastErr;
	for (let i = 0; i < tries; i++) {
		try {
			const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
			if (res.ok && res.status === 200) return res;
			lastErr = new Error(`HTTP ${res.status} for ${url}`);
			if (res.status === 404) break;
		} catch (err) {
			lastErr = err;
		}
		await new Promise((r) => setTimeout(r, 500 * (i + 1)));
	}
	throw lastErr;
};

async function findPreviousCache() {
	const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== CACHE);
	for (const name of names.reverse()) {
		const c = await caches.open(name);
		const r = await c.match(MANIFEST_KEY);
		if (r) return { cache: c, manifest: await r.json() };
	}
	return null;
}

async function syncAll() {
	const cache = await caches.open(CACHE);

	const done = await cache.match(MANIFEST_KEY);
	if (done) {
		await cleanupOld();
		await broadcast({ type: 'pp-ready', version: VERSION });
		return;
	}

	const manifest = await (await fetchWithRetry(scopeUrl('./precache-manifest.json'))).json();
	const files = manifest.files;
	const prev = await findPreviousCache();
	const prevRev = new Map(prev ? prev.manifest.files.map((f) => [f.url, f.rev]) : []);

	const cachedKeys = new Set((await cache.keys()).map((r) => r.url));
	let completed = 0;
	let failed = 0;
	const total = files.length;
	let lastSent = 0;

	const report = (force) => {
		lastProgress = { done: completed, total };
		const t = Date.now();
		if (force || t - lastSent > 400) {
			lastSent = t;
			broadcast({ type: 'pp-progress', done: completed, total });
		}
	};

	let next = 0;
	const worker = async () => {
		while (next < files.length) {
			const f = files[next++];
			const url = scopeUrl(f.url);
			try {
				if (!cachedKeys.has(url)) {
					let res = null;
					if (prev && prevRev.get(f.url) === f.rev) res = await prev.cache.match(url);
					if (!res) res = await fetchWithRetry(url);
					await cache.put(url, res);
				}
				completed++;
			} catch (_) {
				failed++;
			}
			report(false);
		}
	};

	report(true);
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	report(true);

	if (failed > 0) {
		await broadcast({ type: 'pp-error', failed, total });
		return;
	}

	await cache.put(MANIFEST_KEY, new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
	await cleanupOld();
	await broadcast({ type: 'pp-ready', version: VERSION });
}

async function cleanupOld() {
	const names = await caches.keys();
	await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
}

/* ------------------------------------------------------------------ serving */
async function lookup(key) {
	const current = await caches.open(CACHE);
	const hit = await current.match(key, { ignoreSearch: true });
	if (hit) return hit;
	return caches.match(key, { ignoreSearch: true }); // previous version, if still around
}

async function rangeResponse(res, rangeHeader) {
	const buf = await res.arrayBuffer();
	const size = buf.byteLength;
	const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
	let start = 0;
	let end = size - 1;
	if (m) {
		if (m[1] === '' && m[2] !== '') {
			start = Math.max(0, size - Number(m[2]));
		} else {
			start = Number(m[1] || 0);
			if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
		}
	}
	if (start >= size || start > end) {
		return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
	}
	return new Response(buf.slice(start, end + 1), {
		status: 206,
		statusText: 'Partial Content',
		headers: {
			'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
			'Content-Range': `bytes ${start}-${end}/${size}`,
			'Content-Length': String(end - start + 1),
			'Accept-Ranges': 'bytes'
		}
	});
}

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/precache-manifest.json')) return;

	event.respondWith((async () => {
		let key = url.origin + url.pathname;
		if (req.mode === 'navigate' || key === scopeUrl('./')) key = scopeUrl('./index.html');

		const cached = await lookup(key);
		if (cached) {
			const range = req.headers.get('range');
			return range ? rangeResponse(cached, range) : cached;
		}
		try {
			return await fetch(req);
		} catch (err) {
			return new Response('Offline and this file is not downloaded yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
		}
	})());
});
