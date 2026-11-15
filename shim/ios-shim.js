/*
 * PokéPath TD - iPhone / touch compatibility layer.
 * Injected into index.html by tools/build.mjs, before the game's own modules load.
 *
 * What it fixes:
 *  1. Electron-only API (window.electronAPI) -> harmless stub.
 *  2. iOS ignores HTMLMediaElement.volume (always 1). The game's volume sliders and
 *     music cross-fade depend on it (the fade loop never ends on iOS, so music would
 *     never change track). Every audio element is routed through a Web Audio GainNode
 *     and `volume` is redirected to that gain.
 *  3. iOS only lets audio play after a user gesture: the first tap resumes the
 *     AudioContext and unlocks every audio element.
 *  4. Right-click (open Pokémon details on the map) -> long-press.
 *  5. Hover tooltips would swallow the first tap on iOS -> they're suppressed for
 *     taps and shown on long-press instead.
 *  6. Double-click -> double-tap.
 *  7. Keyboard-only actions (Esc / range toggle) -> small on-screen buttons.
 *  8. Offline caching via service worker (web build only) with a progress badge.
 */
(() => {
	'use strict';

	const isNative = location.protocol === 'capacitor:' || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
	const now = () => performance.now();
	document.documentElement.classList.add(isNative ? 'pp-native' : 'pp-web');

	/* ---------------------------------------------------------------- 1. Electron stub */
	window.electronAPI = window.electronAPI || {
		toggleFullscreen: () => {
			const d = document;
			try {
				if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
				else (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen).call(d.documentElement);
			} catch (_) { /* not supported on iPhone; home-screen mode is already fullscreen */ }
			return Promise.resolve();
		}
	};

	/* ---------------------------------------------------------------- 2/3. Audio */
	const AC = window.AudioContext || window.webkitAudioContext;
	let actx = null;
	const getCtx = () => {
		if (!actx && AC) {
			try { actx = new AC(); } catch (_) { actx = null; }
		}
		return actx;
	};
	const resumeCtx = () => {
		const c = getCtx();
		if (c && c.state !== 'running') c.resume().catch(() => {});
	};

	const volDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
	const nativePlay = HTMLMediaElement.prototype.play;
	const audioState = new WeakMap();
	const stateOf = (el) => {
		let s = audioState.get(el);
		if (!s) { s = { vol: 1, gain: null, wired: false }; audioState.set(el, s); }
		return s;
	};

	const wire = (el) => {
		const s = stateOf(el);
		if (s.wired) return;
		s.wired = true;
		const c = getCtx();
		if (!c) { try { volDesc.set.call(el, s.vol); } catch (_) {} return; }
		try {
			const src = c.createMediaElementSource(el);
			const g = c.createGain();
			g.gain.value = s.vol;
			src.connect(g);
			g.connect(c.destination);
			s.gain = g;
			try { volDesc.set.call(el, 1); } catch (_) {}
		} catch (_) {
			try { volDesc.set.call(el, s.vol); } catch (_) {}
		}
	};

	if (volDesc && volDesc.set) {
		Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
			configurable: true,
			enumerable: true,
			get() { return stateOf(this).vol; },
			set(v) {
				let n = Number(v);
				if (!Number.isFinite(n)) n = 0;
				n = Math.min(1, Math.max(0, n));
				const s = stateOf(this);
				s.vol = n;
				if (s.gain) s.gain.gain.value = n;
				else { try { volDesc.set.call(this, n); } catch (_) {} }
			}
		});

		HTMLMediaElement.prototype.play = function () {
			wire(this);
			resumeCtx();
			const p = nativePlay.call(this);
			if (p && typeof p.catch === 'function') p.catch(() => {});
			return p;
		};
	}

	// Track created Audio objects so the first tap can unlock them all.
	const pendingUnlock = new Set();
	const NativeAudio = window.Audio;
	if (NativeAudio) {
		const PatchedAudio = function Audio(src) {
			const a = arguments.length ? new NativeAudio(src) : new NativeAudio();
			pendingUnlock.add(a);
			return a;
		};
		PatchedAudio.prototype = NativeAudio.prototype;
		window.Audio = PatchedAudio;
	}

	window.__ppAudioState = () => (actx ? actx.state : 'none');

	let unlockedOnce = false;
	const unlockAudio = () => {
		resumeCtx();
		// The native app's web view lets media play without a gesture, so it only
		// needs the AudioContext resumed - not a play()/pause() on every element.
		if (isNative) { pendingUnlock.clear(); return; }
		for (const el of pendingUnlock) {
			pendingUnlock.delete(el);
			if (!el.paused || !el.src) continue;
			try {
				const p = nativePlay.call(el);
				el.pause();
				if (p && p.catch) p.catch(() => {});
			} catch (_) {}
		}
		if (!unlockedOnce) {
			unlockedOnce = true;
			// Silent buffer: fully wakes Web Audio on older iOS versions.
			const c = getCtx();
			if (c) {
				try {
					const b = c.createBuffer(1, 1, 22050);
					const n = c.createBufferSource();
					n.buffer = b; n.connect(c.destination); n.start(0);
				} catch (_) {}
			}
		}
	};
	for (const t of ['touchend', 'pointerup', 'click', 'keydown']) {
		window.addEventListener(t, unlockAudio, { capture: true, passive: true });
	}
	document.addEventListener('visibilitychange', () => {
		if (!actx) return;
		if (document.hidden) actx.suspend().catch(() => {});
		else resumeCtx();
	});

	/* ---------------------------------------------------------------- 4-6. Touch */
	const LONG_PRESS_MS = 450;
	const MOVE_TOLERANCE = 12;
	let lastTouchDown = -1e9;
	let lastTouchUp = -1e9;
	let allowHover = false;           // true only while we dispatch our own hover events
	let suppressClickUntil = 0;
	let lastSyntheticContextMenu = -1e9;
	let lp = null;
	let tooltipFromLongPress = false;

	// Read by the patched Tooltip.js: skip hover tooltips triggered by a tap.
	window.__pokeTouch = {
		suppressHover() {
			if (allowHover) return false;
			const t = now();
			return (t - lastTouchDown < 1200) || (t - lastTouchUp < 1200);
		}
	};

	const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

	const mouse = (type, x, y, extra = {}) => new MouseEvent(type, Object.assign({
		bubbles: true, cancelable: true, composed: true, view: window,
		clientX: x, clientY: y, screenX: x, screenY: y
	}, extra));

	const cancelLongPress = () => {
		if (lp) { clearTimeout(lp.timer); lp = null; }
	};

	const showTooltipFor = (target, x, y) => {
		const tip = window.__pokeTooltip;
		allowHover = true;
		try {
			// Tooltips bound with Tooltip.bindTo() (items, achievements) listen to mouseenter.
			let el = target;
			let handled = false;
			while (el && el !== document.body) {
				if (tip && tip.bindings && tip.bindings.has(el)) {
					el.dispatchEvent(mouse('mouseenter', x, y, { bubbles: false }));
					handled = true;
					break;
				}
				el = el.parentElement;
			}
			// Text tooltips use the class "display-tooltip-<id>" + mouseover on #screen-root.
			if (!handled && target.closest && target.closest('[class*="display-tooltip-"]')) {
				target.dispatchEvent(mouse('mouseover', x, y));
				handled = true;
			}
			if (handled) tooltipFromLongPress = true;
			return handled;
		} finally {
			allowHover = false;
		}
	};

	// Light haptic tick (native app only; Safari has no vibration API on iPhone).
	const haptic = () => {
		const C = window.Capacitor;
		if (!isNative || !C || typeof C.nativePromise !== 'function') return;
		try {
			const p = C.nativePromise('Haptics', 'impact', { style: 'LIGHT' });
			if (p && p.catch) p.catch(() => {});
		} catch (_) {}
	};

	const fireLongPress = () => {
		if (!lp) return;
		const { x, y, target } = lp;
		lp.fired = true;
		const canvas = target.closest && target.closest('canvas');
		if (canvas) {
			const g = window.__pokeGame;
			if (g && g.mapDragging) return; // already dragging a Pokémon: not a long-press
			// Same as right-click on the map: opens the Pokémon under the finger.
			const details = g && g.main && g.main.pokemonScene;
			const wasOpen = !!(details && details.isOpen);
			canvas.dispatchEvent(mouse('mousemove', x, y));
			lastSyntheticContextMenu = now();
			canvas.dispatchEvent(mouse('contextmenu', x, y, { button: 2, buttons: 2 }));
			lp.openedDetails = !wasOpen && !!(details && details.isOpen);
			if (lp.openedDetails) haptic();
			suppressClickUntil = now() + 1500;
			return;
		}
		if (showTooltipFor(target, x, y)) {
			haptic();
			suppressClickUntil = now() + 1500;
		}
	};

	// Pause a running wave when the app is swiped away / the phone locks, so you
	// come back to a paused game instead of a wave already in progress.
	// window.__pokeGame is set by the patched Game.js (tools/build.mjs).
	const autoPause = () => {
		const g = window.__pokeGame;
		try {
			if (g && !g.stopped && g.main && g.main.area && g.main.area.waveActive) g.switchPause();
		} catch (_) {}
	};
	document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
	window.addEventListener('pagehide', autoPause);

	document.addEventListener('pointerdown', (e) => {
		if (e.pointerType !== 'touch') return;
		lastTouchDown = now();
		suppressClickUntil = 0; // a new press: stop swallowing leftovers of the last long-press
		if (tooltipFromLongPress && window.__pokeTooltip) {
			window.__pokeTooltip.hide();
			tooltipFromLongPress = false;
		}
		cancelLongPress();
		if (!e.isPrimary || isTyping(e.target)) return;
		lp = { x: e.clientX, y: e.clientY, target: e.target, fired: false, timer: setTimeout(fireLongPress, LONG_PRESS_MS) };
	}, true);

	window.addEventListener('pointermove', (e) => {
		if (!lp || e.pointerType !== 'touch' || !e.isPrimary) return;
		if (Math.abs(e.clientX - lp.x) <= MOVE_TOLERANCE && Math.abs(e.clientY - lp.y) <= MOVE_TOLERANCE) return;
		if (lp.fired) {
			// Held, then started dragging: that's a drag (e.g. moving a Pokémon), so undo
			// what the long-press opened instead of leaving it on top of the drag.
			const g = window.__pokeGame;
			const details = g && g.main && g.main.pokemonScene;
			if (lp.openedDetails && details && details.isOpen) {
				try { details.close(); } catch (_) {}
			}
			if (tooltipFromLongPress && window.__pokeTooltip) {
				window.__pokeTooltip.hide();
				tooltipFromLongPress = false;
			}
			lp.openedDetails = false;
			return;
		}
		cancelLongPress();
	}, true);

	const onTouchEnd = (e) => {
		if (e.pointerType !== 'touch') return;
		lastTouchUp = now();
		cancelLongPress();
	};
	window.addEventListener('pointerup', onTouchEnd, true);
	window.addEventListener('pointercancel', onTouchEnd, true);

	// Swallow the tap that ends a long-press, so it doesn't also place/select.
	const swallowAfterLongPress = (e) => {
		if (now() < suppressClickUntil) {
			e.stopImmediatePropagation();
			e.preventDefault();
			if (e.type === 'click') suppressClickUntil = 0;
		}
	};
	window.addEventListener('click', swallowAfterLongPress, true);
	window.addEventListener('mousedown', swallowAfterLongPress, true);
	window.addEventListener('mouseup', swallowAfterLongPress, true);

	// If iOS ever sends its own contextmenu for the same press, ignore the duplicate.
	window.addEventListener('contextmenu', (e) => {
		if (e.isTrusted && now() - lastSyntheticContextMenu < 1500) {
			e.stopImmediatePropagation();
			e.preventDefault();
		}
	}, true);

	// Double-tap -> dblclick (deterministic; trusted dblclicks from touch are dropped).
	let lastTap = { t: -1e9, target: null, x: 0, y: 0 };
	window.addEventListener('click', (e) => {
		const fromTouch = now() - lastTouchUp < 600;
		if (!e.isTrusted || !fromTouch) return;
		const t = now();
		if (t - lastTap.t < 350 && lastTap.target === e.target &&
			Math.abs(e.clientX - lastTap.x) < 30 && Math.abs(e.clientY - lastTap.y) < 30) {
			lastTap = { t: -1e9, target: null, x: 0, y: 0 };
			const target = e.target;
			const x = e.clientX, y = e.clientY;
			setTimeout(() => target.dispatchEvent(mouse('dblclick', x, y, { detail: 2 })), 0);
		} else {
			lastTap = { t, target: e.target, x: e.clientX, y: e.clientY };
		}
	}, true);
	window.addEventListener('dblclick', (e) => {
		if (e.isTrusted && now() - lastTouchUp < 600) e.stopImmediatePropagation();
	}, true);

	// Tapping a team Pokémon's picture = its (tiny) red deploy button, on touch only.
	// On PC a single click on the picture does nothing; a double-click sends the
	// Pokémon back to the Box - so wait briefly and skip if a second tap follows.
	let spriteTapTimer = null;
	window.addEventListener('click', (e) => {
		if (!e.isTrusted || now() - lastTouchUp > 600) return;
		const sprite = e.target.closest && e.target.closest('.ui-pokemon-sprite');
		if (!sprite) return;
		const slot = sprite.closest('.ui-pokemon');
		const deploy = slot && slot.querySelector('.ui-pokemon-button');
		if (!deploy || !deploy.getClientRects().length || !deploy.getBoundingClientRect().width) return;
		if (spriteTapTimer) { // second tap of a double-tap
			clearTimeout(spriteTapTimer);
			spriteTapTimer = null;
			return;
		}
		spriteTapTimer = setTimeout(() => {
			spriteTapTimer = null;
			deploy.click();
		}, 320);
	}, true);

	// No pinch-zoom / double-tap zoom.
	for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
		document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
	}

	// iOS sometimes reports the old size during rotation; nudge the game's resize().
	const nudgeResize = () => {
		for (const d of [50, 250, 600]) setTimeout(() => window.dispatchEvent(new Event('resize')), d);
	};
	window.addEventListener('orientationchange', nudgeResize);
	if (window.visualViewport) window.visualViewport.addEventListener('resize', nudgeResize);

	/* ---------------------------------------------------------------- 7. Touch dock */
	const pressKey = (key) => {
		const opts = { key, code: key === 'Escape' ? 'Escape' : 'Key' + key.toUpperCase(), bubbles: true, cancelable: true };
		window.dispatchEvent(new KeyboardEvent('keydown', opts));
		window.dispatchEvent(new KeyboardEvent('keyup', opts));
	};

	const buildDock = () => {
		const dock = document.createElement('div');
		dock.id = 'pp-touch-dock';
		const buttons = [
			{ label: '☰', title: 'Back / Menu (Esc)', key: 'Escape' },
			{ label: '◎', title: 'Toggle ranges (X)', key: 'x' }
		];
		for (const b of buttons) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.textContent = b.label;
			btn.setAttribute('aria-label', b.title);
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				pressKey(b.key);
			});
			dock.appendChild(btn);
		}
		document.body.appendChild(dock);

		const rotate = document.createElement('div');
		rotate.id = 'pp-rotate';
		rotate.innerHTML = '<div><div class="pp-rotate-icon">⟳</div>Rotate your phone to landscape</div>';
		document.body.appendChild(rotate);
	};

	/* ---------------------------------------------------------------- 8. Offline cache */
	const badge = (() => {
		let el = null;
		let hideTimer = null;
		return (textContent, done) => {
			if (!el) {
				el = document.createElement('div');
				el.id = 'pp-offline-badge';
				document.body.appendChild(el);
			}
			el.textContent = textContent;
			el.style.display = 'block';
			el.classList.toggle('pp-done', !!done);
			clearTimeout(hideTimer);
			if (done) hideTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
		};
	})();

	const registerServiceWorker = () => {
		if (isNative || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
		if (!window.isSecureContext) return; // e.g. http://192.168.x.x - plays online only

		let ready = false;
		let readyVersion = null;
		try { readyVersion = localStorage.getItem('pp-offline-version'); } catch (_) {}

		navigator.serviceWorker.addEventListener('message', (e) => {
			const m = e.data || {};
			if (m.type === 'pp-progress') {
				if (!ready) badge(`Saving for offline… ${Math.floor((m.done / Math.max(1, m.total)) * 100)}%  (keep app open)`);
			} else if (m.type === 'pp-ready') {
				const firstTime = readyVersion !== m.version;
				ready = true;
				readyVersion = m.version;
				try { localStorage.setItem('pp-offline-version', m.version); } catch (_) {}
				if (firstTime) badge('✓ Ready to play offline', true);
			} else if (m.type === 'pp-error') {
				badge('Offline download incomplete - will retry while online');
			}
		});

		// Ask the browser not to evict the cached game.
		try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) {}

		navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
			const sync = () => {
				if (ready) return;
				const sw = navigator.serviceWorker.controller || reg.active;
				if (sw) sw.postMessage({ type: 'pp-sync' });
			};
			sync();
			// Service workers can be stopped mid-download; keep nudging until complete.
			setInterval(sync, 30000);
			window.addEventListener('online', sync);
			reg.update().catch(() => {});
		}).catch(() => {});
	};

	const onReady = () => {
		buildDock();
		registerServiceWorker();
	};
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
	else onReady();
})();
