#!/usr/bin/env node
/*
 * Tiny static server for ./www (with Range support, which Safari needs for audio).
 *
 *   node tools/serve.mjs [port]
 *
 * Open the printed http://<pc-ip>:<port> on the iPhone (same Wi-Fi) to try the game.
 * Note: plain http on a LAN address is not a "secure context", so iOS won't keep an
 * offline copy from this server - use an HTTPS host or the native app for that.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'www');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
	'.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
	'.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
	'.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

if (!fs.existsSync(ROOT)) {
	console.error('www/ not found - run "npm run build" first.');
	process.exit(1);
}

http.createServer((req, res) => {
	let rel;
	try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
	if (rel.endsWith('/')) rel += 'index.html';
	const file = path.join(ROOT, path.normalize(rel));
	if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }

	fs.stat(file, (err, st) => {
		if (err || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
		const headers = {
			'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
			'Accept-Ranges': 'bytes',
			'Cache-Control': 'no-cache' // dev server: always pick up a fresh build
		};
		const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
		if (m) {
			let start = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]);
			let end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
			if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
			res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
			if (req.method === 'HEAD') return res.end();
			fs.createReadStream(file, { start, end }).pipe(res);
			return;
		}
		res.writeHead(200, { ...headers, 'Content-Length': st.size });
		if (req.method === 'HEAD') return res.end();
		fs.createReadStream(file).pipe(res);
	});
}).listen(PORT, '0.0.0.0', () => {
	console.log(`PokéPath TD at http://localhost:${PORT}`);
	for (const addrs of Object.values(os.networkInterfaces())) {
		for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) console.log(`  on your iPhone (same Wi-Fi): http://${a.address}:${PORT}`);
	}
});
