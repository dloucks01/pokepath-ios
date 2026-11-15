/*
 * PokéPath TD - on-device diagnostics panel.
 * Loaded before everything else so it also catches startup errors.
 *
 * Shows: JavaScript errors, every touch / pointer / mouse / click event with what was
 * under the finger, screen + scaling info, audio state, and whether Web Workers start.
 * Turn on: built with `node tools/build.mjs --debug-hud`, or a 3-finger tap anywhere.
 * The panel never takes touches itself (pointer-events: none).
 */
(() => {
	'use strict';
	const lines = [];
	const errors = [];
	const counts = { touchstart: 0, touchend: 0, pointerdown: 0, pointerup: 0, mousedown: 0, click: 0 };
	let panel = null;
	let enabled = !!window.PP_DEBUG;

	const describe = (el) => {
		if (!el || el === window || el === document) return String(el && (el.nodeName || el));
		const id = el.id ? '#' + el.id : '';
		const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
		return (el.tagName || el.nodeName).toLowerCase() + id + cls;
	};

	const render = () => {
		if (!enabled) return;
		if (!panel) {
			if (!document.body) return;
			panel = document.createElement('pre');
			panel.id = 'pp-debug-hud';
			panel.style.cssText = [
				'position:fixed', 'z-index:2147483647', 'left:4px', 'top:4px', 'max-width:60vw', 'max-height:92vh',
				'overflow:hidden', 'margin:0', 'padding:4px 6px', 'background:rgba(0,0,0,.78)', 'color:#9f9',
				'font:10px/1.25 Menlo,monospace', 'white-space:pre-wrap', 'pointer-events:none', 'border-radius:4px'
			].join(';');
			document.body.appendChild(panel);
		}
		panel.style.display = 'block';
		const root = document.getElementById('screen-root');
		const cx = innerWidth / 2, cy = innerHeight / 2;
		const info = [
			`PokéPath debug  ${location.protocol}//${location.host}  native=${!!window.Capacitor}`,
			`view ${innerWidth}x${innerHeight} dpr=${devicePixelRatio} orient=${matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'} scale=${root ? root.style.transform : '-'}`,
			`center hit: ${describe(document.elementFromPoint(cx, cy))}`,
			`audio=${window.__ppAudioState ? window.__ppAudioState() : '?'}  worker=${workerStatus}  game=${!!window.__pokeGame}`,
			`counts ${Object.entries(counts).map(([k, v]) => k + ':' + v).join(' ')}`,
			`main-thread lag (worst in last 5s): ${Math.round(Math.max(...lagWindow, 0))} ms`
		];
		const errText = errors.slice(-6).map((e) => '✖ ' + e);
		panel.textContent = [...info, ...errText, '—', ...lines.slice(-12)].join('\n');
		panel.style.color = errors.length ? '#fbb' : '#9f9';
	};

	// In the native app, console.log goes to the Xcode/simulator console (used by CI tests).
	const consoleLog = console.log.bind(console);
	const log = (s) => {
		if (window.PP_DEBUG) consoleLog('[pp] ' + s);
		lines.push(s);
		if (lines.length > 40) lines.shift();
		render();
	};

	// ---- errors (from the very start) ----
	window.addEventListener('error', (e) => {
		const msg = e.message
			? `${e.message} @ ${(e.filename || '').split('/').slice(-2).join('/')}:${e.lineno}`
			: `failed to load ${describe(e.target)} ${e.target && (e.target.src || e.target.href) || ''}`;
		errors.push(msg);
		if (window.PP_DEBUG) consoleLog('[pp] ERROR ' + msg);
		render();
	}, true);
	window.addEventListener('unhandledrejection', (e) => {
		const r = e.reason;
		errors.push('promise: ' + (r && (r.message || r.name) || String(r)));
		render();
	});
	const origError = console.error;
	console.error = function (...args) {
		errors.push('console: ' + args.map((a) => (a && a.message) || String(a)).join(' ').slice(0, 160));
		render();
		return origError.apply(this, args);
	};

	// ---- input events ----
	const t0 = performance.now();
	const onEvent = (e) => {
		if (e.type in counts) counts[e.type]++;
		if (!enabled) return;
		const p = e.changedTouches ? e.changedTouches[0] : e;
		const x = Math.round(p.clientX), y = Math.round(p.clientY);
		const under = document.elementFromPoint(x, y);
		const flags = [e.defaultPrevented ? 'PREVENTED' : '', e.isTrusted ? '' : 'synthetic', e.pointerType || ''].filter(Boolean).join(',');
		log(`${((performance.now() - t0) / 1000).toFixed(1)}s ${e.type} (${x},${y}) tgt=${describe(e.target)}${under !== e.target ? ' under=' + describe(under) : ''} ${flags}`);
	};
	for (const t of Object.keys(counts)) {
		window.addEventListener(t, onEvent, { capture: true, passive: true });
		// bubble-phase too, to see whether something stops propagation along the way
		window.addEventListener(t, (e) => { if (enabled && t === 'click') log(`   click reached window (bubble)`); }, { passive: true });
	}

	// 3-finger tap toggles the panel.
	window.addEventListener('touchstart', (e) => {
		if (e.touches.length === 3) {
			enabled = !enabled;
			if (panel) panel.style.display = enabled ? 'block' : 'none';
			render();
		}
	}, { capture: true, passive: true });

	// ---- can a blob Web Worker start here? (the game's loop uses one) ----
	let workerStatus = 'testing';
	try {
		const url = URL.createObjectURL(new Blob(['postMessage("ok")'], { type: 'application/javascript' }));
		const w = new Worker(url);
		const timer = setTimeout(() => { workerStatus = 'no reply'; render(); }, 3000);
		w.onmessage = () => { clearTimeout(timer); workerStatus = 'ok'; w.terminate(); render(); };
		w.onerror = (e) => { clearTimeout(timer); workerStatus = 'error: ' + (e.message || 'failed'); render(); };
	} catch (err) {
		workerStatus = 'throws: ' + err.message;
	}

	// Startup phases, to see where time goes.
	let phase = 'boot';
	const mark = (name) => {
		phase = name;
		if (window.PP_DEBUG) consoleLog(`[pp] PHASE ${name} at t=${((performance.now() - t0) / 1000).toFixed(2)}s`);
	};
	document.addEventListener('DOMContentLoaded', () => mark('dom-ready'));
	window.addEventListener('load', () => mark('window-load'));
	const phaseWatch = new MutationObserver(() => {
		if (phase === 'dom-ready' || phase === 'window-load' || phase === 'boot') {
			if (document.querySelector('.loading-bar')) mark('loading-screen');
		}
		if (phase === 'loading-screen' && !document.querySelector('.init-scene')) mark('loading-done');
		if (phase === 'loading-done' && window.__pokeGame) { mark('game-running'); phaseWatch.disconnect(); }
	});
	phaseWatch.observe(document.documentElement, { childList: true, subtree: true });
	window.__ppMark = mark;

	// How late a 100 ms timer fires = how long the page was too busy to react to touches.
	const lagWindow = [];
	let expected = performance.now() + 100;
	setInterval(() => {
		const t = performance.now();
		const lag = Math.max(0, t - expected);
		if (lag > 250 && window.PP_DEBUG) consoleLog(`[pp] BLOCKED ${Math.round(lag)}ms ending at t=${((t - t0) / 1000).toFixed(1)}s (phase: ${phase})`);
		lagWindow.push(lag);
		if (lagWindow.length > 50) lagWindow.shift();
		expected = t + 100;
	}, 100);

	setInterval(render, 1000);

	// Where the main buttons are (CSS px = iOS points), for the Simulator test driver.
	let lastTargets = '';
	setInterval(() => {
		if (!window.PP_DEBUG) return;
		const out = {};
		const add = (name, el) => {
			if (!el) return;
			const r = el.getBoundingClientRect();
			if (r.width > 0 && r.height > 0) out[name] = [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
		};
		const leaves = [...document.querySelectorAll('#screen div')].filter((e) => e.children.length === 0 && e.getClientRects().length);
		add('start', document.querySelector('.new-game-start-button'));
		add('next', leaves.find((e) => e.textContent.trim() === 'NEXT'));
		add('end', leaves.find((e) => e.textContent.trim() === 'END'));
		add('nextWave', document.querySelector('.ui-next-wave'));
		add('pause', document.querySelector('.ui-pause-wave'));
		add('teamSlot1', document.querySelector('.ui-pokemon'));
		add('sprite1', document.querySelector('.ui-pokemon .ui-pokemon-sprite'));
		add('deploy1', document.querySelector('.ui-pokemon .ui-pokemon-button')); // red "deploy" button of slot 1
		add('canvas', document.querySelector('canvas'));
		add('menuDock', document.querySelector('#pp-touch-dock button'));
		add('profileIcon', document.querySelector('.ui-section'));
		add('achievement', [...document.querySelectorAll('.profile-scene-achievement')].find((e) => e.getClientRects().length));

		// Map tiles (canvas coordinates) -> screen points.
		const g = window.__pokeGame;
		const main = g && g.main;
		const canvas = document.querySelector('canvas');
		if (main && main.area && canvas && canvas.offsetWidth) {
			const r = canvas.getBoundingClientRect();
			const k = r.width / canvas.offsetWidth;
			const at = (tile) => [Math.round(r.left + (tile.position.x + tile.size / 2) * k), Math.round(r.top + (tile.position.y + tile.size / 2) * k)];
			const tiles = main.area.placementTiles || [];
			const first = main.team && main.team.pokemon && main.team.pokemon[0];
			const free = tiles.find((t) => !t.tower && !t.passenger && first &&
				(typeof t.canPlacePokemonHere === 'function' ? t.canPlacePokemonHere(first) : (first.tiles || []).includes(t.land)));
			if (free) out.freeTile = at(free);
			const placed = tiles.find((t) => t.tower);
			if (placed) out.tower = at(placed);
			const tip = window.__pokeTooltip && window.__pokeTooltip.tooltip;
			out.state = {
				towers: (main.area.towers || []).length,
				deploying: !!g.deployingUnit,
				details: !!(main.pokemonScene && main.pokemonScene.isOpen),
				profile: !!(main.profileScene && main.profileScene.isOpen),
				menu: !!(main.menuScene && main.menuScene.isOpen),
				tooltip: !!(tip && tip.style.display === 'block'),
				wave: !!main.area.waveActive,
				paused: !!g.stopped
			};
		}
		const json = JSON.stringify(out);
		if (json !== lastTargets) {
			lastTargets = json;
			consoleLog('[pp] TARGETS ' + json);
		}
	}, 500);

	// Periodic one-line status for test logs.
	setInterval(() => {
		if (!window.PP_DEBUG) return;
		const root = document.getElementById('screen-root');
		consoleLog(`[pp] STATUS t=${((performance.now() - t0) / 1000).toFixed(0)}s view=${innerWidth}x${innerHeight} scale=${root ? root.style.transform : '-'} audio=${window.__ppAudioState ? window.__ppAudioState() : '?'} worker=${workerStatus} game=${!!window.__pokeGame} wave=${!!(window.__pokeGame && window.__pokeGame.main && window.__pokeGame.main.area && window.__pokeGame.main.area.waveActive)} lagMax5s=${Math.round(Math.max(...lagWindow, 0))}ms errors=${errors.length} sound=${window.__ppAudioDebug ? JSON.stringify(window.__ppAudioDebug()) : '-'} counts=${JSON.stringify(counts)}`);
	}, 5000);
	document.addEventListener('DOMContentLoaded', render);
})();
