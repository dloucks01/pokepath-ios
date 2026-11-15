#!/usr/bin/env node
/*
 * Turns the PokéPath TD Windows build into an iPhone-ready web app in ./www
 *
 *   node tools/build.mjs [input]
 *
 * [input] can be any of:
 *   - the installer ("PokéPath TD Setup.exe") or the zip it came in
 *   - an installed copy's resources/app.asar, or its install folder
 *   - an already-unpacked game folder (containing index.html + src/)
 * With no argument, the newest "*Setup*.exe" / "*Setup*.zip" next to this project is used.
 *
 * Output (./www) is used both by the home-screen web app (host it on any HTTPS static
 * host) and by the native Capacitor app (npx cap sync ios).
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as asar from '@electron/asar';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const TMP = path.join(ROOT, '.build-tmp');
const SHIM = path.join(ROOT, 'shim');

const log = (...a) => console.log('•', ...a);
const warn = (...a) => console.warn('⚠', ...a);
const die = (msg) => { console.error('✖', msg); process.exit(1); };

/* ------------------------------------------------------------------ locate input */
function findDefaultInput() {
	const dirs = [path.resolve(ROOT, '..'), ROOT];
	const hits = [];
	for (const dir of dirs) {
		const walk = (d, depth) => {
			if (depth > 2) return;
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) {
					if (['node_modules', '.git', 'www', '.build-tmp', 'ios', 'shim'].includes(e.name) || p === ROOT) continue;
					walk(p, depth + 1);
				} else if (/setup.*\.(exe|zip)$/i.test(e.name)) {
					hits.push({ p, t: fs.statSync(p).mtimeMs, exe: /\.exe$/i.test(e.name) });
				}
			}
		};
		walk(dir, 0);
	}
	hits.sort((a, b) => (b.exe - a.exe) || (b.t - a.t));
	return hits[0]?.p;
}

function find7z() {
	const candidates = [
		process.env.SEVEN_ZIP,
		'C:/Program Files/7-Zip/7z.exe',
		'C:/Program Files (x86)/7-Zip/7z.exe',
		'7z', '7zz', '7za'
	].filter(Boolean);
	for (const c of candidates) {
		try {
			execFileSync(c, ['i'], { stdio: 'ignore' });
			return c;
		} catch (_) { /* try next */ }
	}
	die('7-Zip is needed to unpack the installer. Install it from https://www.7-zip.org/ (or set SEVEN_ZIP).');
}

const sevenZip = (args) => execFileSync(find7z(), args, { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 30 });

function extractAsar(asarFile) {
	const out = path.join(TMP, 'app');
	fs.rmSync(out, { recursive: true, force: true });
	log('Unpacking app.asar');
	asar.extractAll(asarFile, out);
	return out;
}

function resolveGameDir(input) {
	const stat = fs.statSync(input);
	if (stat.isDirectory()) {
		if (fs.existsSync(path.join(input, 'index.html')) && fs.existsSync(path.join(input, 'src'))) return input;
		const a = path.join(input, 'resources', 'app.asar');
		if (fs.existsSync(a)) return extractAsar(a);
		die(`Couldn't find the game inside ${input}`);
	}
	const ext = path.extname(input).toLowerCase();
	if (ext === '.asar') return extractAsar(input);
	if (ext === '.exe') {
		const nsis = path.join(TMP, 'nsis');
		fs.rmSync(nsis, { recursive: true, force: true });
		log('Unpacking installer (this takes a moment)');
		sevenZip(['e', '-y', `-o${nsis}`, input, '$PLUGINSDIR/app-64.7z']);
		const payload = path.join(nsis, 'app-64.7z');
		if (!fs.existsSync(payload)) die('Installer layout not recognised (no app-64.7z inside).');
		sevenZip(['e', '-y', `-o${nsis}`, payload, 'resources/app.asar']);
		return extractAsar(path.join(nsis, 'app.asar'));
	}
	if (ext === '.zip' || ext === '.7z') {
		const out = path.join(TMP, 'archive');
		fs.rmSync(out, { recursive: true, force: true });
		log('Unpacking archive');
		sevenZip(['x', '-y', `-o${out}`, input]);
		const found = [];
		const walk = (d) => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) walk(p);
				else if (/\.exe$/i.test(e.name) && /setup/i.test(e.name)) found.push(p);
				else if (e.name === 'app.asar') found.unshift(p);
			}
		};
		walk(out);
		if (!found.length) die('No installer or app.asar found in the archive.');
		return resolveGameDir(found[0]);
	}
	die(`Don't know how to read ${input}`);
}

/* ------------------------------------------------------------------ copy */
const SKIP_TOP = new Set(['main.js', 'preload.js', 'package.json', 'node_modules', 'todo.txt', 'config.json']);
const SKIP_FILES = new Set(['icon.icns']);

function copyGame(gameDir) {
	fs.rmSync(WWW, { recursive: true, force: true });
	fs.mkdirSync(WWW, { recursive: true });
	for (const e of fs.readdirSync(gameDir, { withFileTypes: true })) {
		if (SKIP_TOP.has(e.name)) continue;
		fs.cpSync(path.join(gameDir, e.name), path.join(WWW, e.name), {
			recursive: true,
			filter: (src) => !SKIP_FILES.has(path.basename(src))
		});
	}
}

/* ------------------------------------------------------------------ patches */
function patchFile(rel, fn) {
	const p = path.join(WWW, rel);
	if (!fs.existsSync(p)) { warn(`${rel} not found - skipped its patch`); return; }
	const before = fs.readFileSync(p, 'utf8');
	const after = fn(before);
	if (after === before) warn(`${rel}: patch did not apply (game code changed?)`);
	else fs.writeFileSync(p, after);
}

function patchIndex() {
	patchFile('index.html', (html) => {
		const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">';
		html = /<meta\s+name=["']viewport["'][^>]*>/i.test(html)
			? html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, viewport)
			: html.replace(/<head>/i, `<head>\n    ${viewport}`);
		const head = [
			'<!-- iPhone build -->',
			'<meta name="apple-mobile-web-app-capable" content="yes">',
			'<meta name="mobile-web-app-capable" content="yes">',
			'<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
			'<meta name="apple-mobile-web-app-title" content="PokéPath">',
			'<meta name="format-detection" content="telephone=no">',
			'<meta name="theme-color" content="#111111">',
			'<link rel="manifest" href="./manifest.webmanifest">',
			'<link rel="apple-touch-icon" href="./ios/icons/icon-180.png">',
			'<link rel="stylesheet" href="./ios/ios-shim.css">',
			...(DEBUG_HUD ? ['<script>window.PP_DEBUG = 1;</script>'] : []),
			'<script src="./ios/debug-hud.js"></script>',
			'<script src="./ios/ios-shim.js"></script>'
		].map((l) => '    ' + l).join('\n');
		return html.replace(/<\/head>/i, `${head}\n</head>`);
	});
}

function patchTooltip() {
	// Lets the shim (a) skip hover tooltips caused by taps and (b) reach the tooltip
	// instance so a long-press can show it.
	patchFile('src/js/utils/Tooltip.js', (src) => {
		if (!/export class Tooltip/.test(src)) return src;
		return src + `

/* --- iPhone build: touch-aware tooltips (added by tools/build.mjs) --- */
(() => {
	const P = Tooltip.prototype;
	for (const name of ['showAchievement', 'showItem', 'showTextTooltip']) {
		const original = P[name];
		if (typeof original !== 'function') continue;
		P[name] = function (...args) {
			window.__pokeTooltip = this;
			if (window.__pokeTouch && window.__pokeTouch.suppressHover()) return;
			return original.apply(this, args);
		};
	}
	for (const name of ['bindTo', 'hide']) {
		const original = P[name];
		if (typeof original !== 'function') continue;
		P[name] = function (...args) {
			window.__pokeTooltip = this;
			return original.apply(this, args);
		};
	}
})();
`;
	});
}

function patchGame() {
	// Exposes the running Game so the shim can auto-pause a wave when the app is backgrounded.
	patchFile('src/js/game/Game.js', (src) => {
		if (!/export class Game[\s{]/.test(src)) return src;
		return src + `

/* --- iPhone build: expose the game for auto-pause (added by tools/build.mjs) --- */
(() => {
	const P = Game.prototype;
	for (const name of ['load', 'switchPause', 'resume']) {
		const original = P[name];
		if (typeof original !== 'function') continue;
		P[name] = function (...args) {
			window.__pokeGame = this;
			return original.apply(this, args);
		};
	}
})();
`;
	});
}

function checkAssumptions() {
	const read = (rel) => { try { return fs.readFileSync(path.join(WWW, rel), 'utf8'); } catch { return ''; } };
	if (!/function resize\(\)/.test(read('src/js/game/Main.js'))) warn('Main.js resize() not found - screen scaling may differ.');
	if (!/new Audio\(/.test(read('src/js/file/audio.js'))) warn('audio.js no longer uses new Audio() - check sound on iPhone.');
}

/* ------------------------------------------------------------------ artwork */
function runPython(script, args) {
	const py = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
	for (const exe of py) {
		try {
			execFileSync(exe, [path.join(ROOT, 'tools', script), ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
			return true;
		} catch (_) { /* try next */ }
	}
	return false;
}

function makeIcons() {
	const out = path.join(WWW, 'ios', 'icons');
	fs.mkdirSync(out, { recursive: true });
	const src = path.join(WWW, 'src', 'assets', 'icon.png');
	if (runPython('make-icons.py', [src, out])) return;
	warn('Python + Pillow not available - using the raw icon.png for every icon size.');
	for (const s of [180, 192, 512, 1024]) fs.copyFileSync(src, path.join(out, `icon-${s}.png`));
}

// Native app launch screen (used by native/configure-ios.sh; not part of www/).
function makeSplash() {
	const out = path.join(ROOT, 'native', 'splash-2732.png');
	fs.mkdirSync(path.dirname(out), { recursive: true });
	const ok = runPython('make-splash.py', [
		path.join(WWW, 'src', 'assets', 'icon.png'),
		path.join(WWW, 'src', 'assets', 'fonts', 'PressStart2P.ttf'),
		out
	]);
	if (!ok && !fs.existsSync(out)) warn('Python + Pillow not available - the native app keeps the default launch screen.');
}

function writeManifest() {
	const manifest = {
		name: 'PokéPath TD',
		short_name: 'PokéPath',
		start_url: './index.html',
		scope: './',
		display: 'fullscreen',
		display_override: ['fullscreen', 'standalone'],
		orientation: 'landscape',
		background_color: '#111111',
		theme_color: '#111111',
		icons: [
			{ src: './ios/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
			{ src: './ios/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
			{ src: './ios/icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }
		]
	};
	fs.writeFileSync(path.join(WWW, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
}

function listFiles(dir, base = dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) listFiles(p, base, out);
		else out.push(path.relative(base, p).split(path.sep).join('/'));
	}
	return out;
}

function writeServiceWorker() {
	const files = listFiles(WWW)
		.filter((f) => f !== 'sw.js' && f !== 'precache-manifest.json' && !f.startsWith('.'))
		.sort();
	let bytes = 0;
	const entries = files.map((f) => {
		const buf = fs.readFileSync(path.join(WWW, f));
		bytes += buf.length;
		return { url: './' + encodeURI(f), rev: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12), size: buf.length };
	});
	const swSource = fs.readFileSync(path.join(SHIM, 'sw.js'), 'utf8');
	const shimHash = crypto.createHash('sha1').update(swSource).digest('hex');
	const version = crypto.createHash('sha1').update(JSON.stringify(entries) + shimHash).digest('hex').slice(0, 12);
	fs.writeFileSync(path.join(WWW, 'precache-manifest.json'), JSON.stringify({ version, bytes, files: entries }));
	fs.writeFileSync(path.join(WWW, 'sw.js'), swSource.replace(/__PP_VERSION__/g, version));
	fs.writeFileSync(path.join(WWW, '.nojekyll'), '');
	return { version, count: entries.length, bytes };
}

/* ------------------------------------------------------------------ main */
const args = process.argv.slice(2);
const DEBUG_HUD = args.includes('--debug-hud') || process.env.PP_DEBUG_HUD === '1';
const positional = args.filter((a) => !a.startsWith('--'));
const input = positional[0] ? path.resolve(positional[0]) : findDefaultInput();
if (!input || !fs.existsSync(input)) die('Pass the PokéPath TD installer (.exe/.zip) or game folder as an argument.');
log('Input:', input);
if (DEBUG_HUD) log('Diagnostics panel: ON (always visible)');

fs.mkdirSync(TMP, { recursive: true });
const gameDir = resolveGameDir(input);
log('Copying game files');
copyGame(gameDir);

log('Applying iPhone patches');
patchIndex();
patchTooltip();
patchGame();
checkAssumptions();
fs.mkdirSync(path.join(WWW, 'ios'), { recursive: true });
for (const f of ['ios-shim.js', 'ios-shim.css', 'debug-hud.js']) fs.copyFileSync(path.join(SHIM, f), path.join(WWW, 'ios', f));
makeIcons();
makeSplash();
writeManifest();
const { version, count, bytes } = writeServiceWorker();

fs.rmSync(TMP, { recursive: true, force: true });
log(`Done: ${count} files, ${(bytes / 1048576).toFixed(1)} MB -> ${path.relative(process.cwd(), WWW) || WWW} (offline cache version ${version})`);
