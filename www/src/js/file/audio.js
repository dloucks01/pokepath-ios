/*
 * PokéPath TD - iPhone sound engine (replaces src/js/file/audio.js in the iPhone build).
 *
 * The original creates one <audio> element per sound (~250, plus ~114 more for
 * preloading). On iOS every media element is a full system media player, which makes
 * the whole app sluggish, and iOS also ignores element volume. This version uses
 * Web Audio instead:
 *   - UI sounds and effects are decoded once into AudioBuffers and played instantly.
 *   - Music is one looping AudioBuffer at a time, cross-faded with a gain ramp.
 *   - Volume sliders drive one gain node per category (ui / effect / music).
 * Same exports and behaviour as the original module (playSound, playMusic, setVolume,
 * crySound, soundUi, soundEffect, soundMusic).
 *
 * tools/build.mjs fills in the sound lists below from the game's own audio.js.
 */
const BANKS = {
	"ui": {
		"close": "./src/assets/sounds/ui/close.wav",
		"open": "./src/assets/sounds/ui/open.wav",
		"hover1": "./src/assets/sounds/ui/hover1.wav",
		"hover2": "./src/assets/sounds/ui/hover2.wav",
		"hover3": "./src/assets/sounds/ui/hover3.wav",
		"option": "./src/assets/sounds/ui/option.wav",
		"button1": "./src/assets/sounds/ui/button1.wav",
		"button2": "./src/assets/sounds/ui/button2.wav",
		"key0": "./src/assets/sounds/ui/key0.wav",
		"key1": "./src/assets/sounds/ui/key1.wav",
		"click1": "./src/assets/sounds/ui/click1.wav",
		"select": "./src/assets/sounds/ui/select.wav",
		"obtain": "./src/assets/sounds/ui/obtain.wav",
		"step": "./src/assets/sounds/ui/step.wav",
		"equip": "./src/assets/sounds/ui/equip.wav",
		"unequip": "./src/assets/sounds/ui/unequip.wav",
		"pop0": "./src/assets/sounds/ui/pop0.wav",
		"purchase": "./src/assets/sounds/ui/purchase.wav",
		"end": "./src/assets/sounds/ui/end.wav",
		"click0": "./src/assets/sounds/ui/click0.wav",
		"start": "./src/assets/sounds/ui/start.wav",
		"results": "./src/assets/sounds/ui/results.wav"
	},
	"effect": {
		"projectile1": "./src/assets/sounds/effect/projectile1.wav",
		"projectile2": "./src/assets/sounds/effect/projectile2.wav",
		"projectile3": "./src/assets/sounds/effect/projectile3.wav",
		"projectile4": "./src/assets/sounds/effect/projectile4.wav",
		"projectile5": "./src/assets/sounds/effect/projectile5.wav",
		"projectile6": "./src/assets/sounds/effect/projectile5.wav",
		"area1": "./src/assets/sounds/effect/area1.wav",
		"area2": "./src/assets/sounds/effect/area2.wav",
		"area3": "./src/assets/sounds/effect/area3.wav",
		"area4": "./src/assets/sounds/effect/area4.wav",
		"area5": "./src/assets/sounds/effect/area5.wav",
		"hit2": "./src/assets/sounds/effect/hit2.wav",
		"hit3": "./src/assets/sounds/effect/hit3.wav",
		"hit4": "./src/assets/sounds/effect/hit4.wav",
		"chatot": "./src/assets/sounds/effect/chatot.wav",
		"teleport": "./src/assets/sounds/effect/teleport.wav",
		"aegislashChange": "./src/assets/sounds/effect/aegislashChange.wav",
		"ding": "./src/assets/sounds/effect/ding.wav",
		"shiny": "./src/assets/sounds/effect/shiny.wav",
		"dog1": "./src/assets/sounds/effect/dog1.wav",
		"dog2": "./src/assets/sounds/effect/dog2.wav",
		"dog3": "./src/assets/sounds/effect/dog3.wav",
		"dog4": "./src/assets/sounds/effect/dog4.wav",
		"beam1": "./src/assets/sounds/effect/beam1.wav",
		"beam2": "./src/assets/sounds/effect/beam2.wav",
		"beam3": "./src/assets/sounds/effect/beam3.wav",
		"beam4": "./src/assets/sounds/effect/beam4.wav",
		"rockThrow": "./src/assets/sounds/effect/rockThrow.wav",
		"regenerator": "./src/assets/sounds/effect/regenerator.wav",
		"invi": "./src/assets/sounds/effect/invi.wav",
		"earthquake": "./src/assets/sounds/effect/earthquake.wav",
		"paralyzed": "./src/assets/sounds/effect/paralyzed.wav",
		"bell": "./src/assets/sounds/effect/bell.wav",
		"bronzor1": "./src/assets/sounds/effect/bronzor1.wav",
		"bronzor2": "./src/assets/sounds/effect/bronzor2.wav",
		"chimecho": "./src/assets/sounds/effect/chimecho.wav",
		"rillaboom": "./src/assets/sounds/effect/rillaboom.wav",
		"sword": "./src/assets/sounds/effect/sword.wav",
		"chain": "./src/assets/sounds/effect/chain.wav",
		"kyogre": "./src/assets/sounds/effect/kyogre.wav",
		"thunder": "./src/assets/sounds/effect/thunder.wav",
		"explosion": "./src/assets/sounds/effect/explosion.wav",
		"ice": "./src/assets/sounds/effect/ice.wav",
		"pull": "./src/assets/sounds/effect/pull.wav",
		"shadowTag": "./src/assets/sounds/effect/shadowTag.wav",
		"fire": "./src/assets/sounds/effect/fire.wav",
		"dance": "./src/assets/sounds/effect/dance.wav",
		"door": "./src/assets/sounds/effect/door.wav"
	},
	"music": {
		"intro": "./src/assets/sounds/music/intro.mp3",
		"route1": "./src/assets/sounds/music/route1.mp3",
		"route2": "./src/assets/sounds/music/route2.mp3",
		"route3": "./src/assets/sounds/music/route3.mp3",
		"route4": "./src/assets/sounds/music/route4.mp3",
		"route5": "./src/assets/sounds/music/route5.mp3",
		"route6": "./src/assets/sounds/music/route6.mp3",
		"route7": "./src/assets/sounds/music/route7.mp3",
		"route8": "./src/assets/sounds/music/route8.mp3",
		"route9": "./src/assets/sounds/music/route9.mp3",
		"route10": "./src/assets/sounds/music/route10.mp3",
		"route11": "./src/assets/sounds/music/route11.mp3",
		"route12": "./src/assets/sounds/music/route12.mp3",
		"route13": "./src/assets/sounds/music/route13.mp3",
		"route14": "./src/assets/sounds/music/route14.mp3",
		"route15": "./src/assets/sounds/music/route15.mp3",
		"route16": "./src/assets/sounds/music/route16.mp3",
		"route17": "./src/assets/sounds/music/route17.mp3",
		"route18": "./src/assets/sounds/music/route18.mp3",
		"route19": "./src/assets/sounds/music/route19.mp3",
		"route20": "./src/assets/sounds/music/route20.mp3",
		"route21": "./src/assets/sounds/music/route21.mp3",
		"route22": "./src/assets/sounds/music/route22.mp3",
		"route23": "./src/assets/sounds/music/route23.mp3",
		"route24": "./src/assets/sounds/music/route24.mp3",
		"route25": "./src/assets/sounds/music/route25.mp3",
		"route26": "./src/assets/sounds/music/route26.mp3",
		"route27": "./src/assets/sounds/music/route27.mp3",
		"route28": "./src/assets/sounds/music/route28.mp3",
		"route29": "./src/assets/sounds/music/route29.mp3",
		"route30": "./src/assets/sounds/music/route30.mp3",
		"route31": "./src/assets/sounds/music/route31.mp3",
		"route32": "./src/assets/sounds/music/route32.mp3",
		"route33": "./src/assets/sounds/music/route33.mp3",
		"route34": "./src/assets/sounds/music/route34.mp3",
		"route35": "./src/assets/sounds/music/route35.mp3",
		"route36": "./src/assets/sounds/music/route36.mp3",
		"route37": "./src/assets/sounds/music/route37.mp3",
		"route38": "./src/assets/sounds/music/route38.mp3",
		"route39": "./src/assets/sounds/music/route39.mp3",
		"route40": "./src/assets/sounds/music/route40.mp3",
		"halloween": "./src/assets/sounds/music/halloween.mp3"
	}
};

export const soundUi = BANKS.ui;
export const soundEffect = BANKS.effect;
export const soundMusic = BANKS.music;

const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null;
const gains = {};

function context() {
	if (ctx || !AC) return ctx;
	try {
		ctx = new AC({ latencyHint: 'interactive' });
	} catch (_) {
		ctx = new AC();
	}
	for (const name of ['ui', 'effect', 'music']) {
		gains[name] = ctx.createGain();
		gains[name].connect(ctx.destination);
	}
	window.__ppAudioState = () => ctx.state;
	applyVolume();
	if (window.PP_DEBUG) installMeters();
	return ctx;
}

/* ------------------------------------------------------------------ test meters
 * Only with the diagnostics panel's test mode (window.PP_DEBUG): measures the peak
 * signal level each category actually produced, so an automated test can check
 * that sound plays without anyone listening. */
const started = { ui: 0, effect: 0, music: 0 };
function installMeters() {
	const peaks = { ui: 0, effect: 0, music: 0 };
	const analysers = {};
	for (const name of Object.keys(peaks)) {
		const a = ctx.createAnalyser();
		a.fftSize = 512;
		gains[name].connect(a);
		analysers[name] = { node: a, buf: new Float32Array(a.fftSize) };
	}
	setInterval(() => {
		for (const [name, { node, buf }] of Object.entries(analysers)) {
			node.getFloatTimeDomainData(buf);
			let sum = 0;
			for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
			peaks[name] = Math.max(peaks[name], Math.sqrt(sum / buf.length));
		}
	}, 40);
	window.__ppAudioDebug = () => {
		const out = {
			state: ctx.state,
			time: Math.round(ctx.currentTime),
			music: current ? current.name : null,
			started: { ...started },
			loaded: loadStats.ok,
			failed: loadStats.failed,
			lastError: loadStats.lastError,
			peak: Object.fromEntries(Object.entries(peaks).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
			gain: Object.fromEntries(Object.entries(gains).map(([k, g]) => [k, Math.round(g.gain.value * 1000) / 1000]))
		};
		for (const k of Object.keys(peaks)) peaks[k] = 0;
		return out;
	};
}

const resume = () => {
	const c = context();
	if (c && c.state !== 'running') c.resume().catch(() => {});
};
for (const t of ['touchend', 'pointerup', 'click', 'keydown']) {
	window.addEventListener(t, resume, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
	if (!ctx) return;
	if (document.hidden) ctx.suspend().catch(() => {});
	else resume();
});

/* ------------------------------------------------------------------ volume */
function readAudioConfig() {
	try {
		return JSON.parse(window.localStorage.getItem('data')).config.audio;
	} catch (_) {
		return { master: 20, ui: 20, music: 20, effects: 20 };
	}
}

function applyVolume() {
	if (!ctx) return;
	const audio = readAudioConfig();
	const master = audio.master * 0.05;
	const target = {
		ui: audio.ui * 0.05 * master,
		music: audio.music * 0.05 * master,
		effect: audio.effects * 0.05 * master
	};
	for (const [name, value] of Object.entries(target)) {
		const g = gains[name].gain;
		g.cancelScheduledValues(ctx.currentTime);
		g.setTargetAtTime(Math.max(0, Math.min(1, value || 0)), ctx.currentTime, 0.015);
	}
}

export function setVolume() {
	context();
	applyVolume();
}

/* ------------------------------------------------------------------ loading */
const buffers = new Map(); // url -> AudioBuffer | Promise<AudioBuffer>
const loadStats = { ok: 0, failed: 0, lastError: '' };

function load(url) {
	const have = buffers.get(url);
	if (have) return have instanceof Promise ? have : Promise.resolve(have);
	const c = context();
	if (!c) return Promise.reject(new Error('no Web Audio'));
	const p = fetch(url)
		.then((r) => {
			if (!r.ok) throw new Error(`${r.status} ${url}`);
			return r.arrayBuffer();
		})
		.then((data) => new Promise((resolve, reject) => {
			// callback form works on every iOS version
			const out = c.decodeAudioData(data, resolve, reject);
			if (out && out.then) out.then(resolve, reject);
		}))
		.then((buffer) => {
			buffers.set(url, buffer);
			loadStats.ok++;
			return buffer;
		});
	p.catch((err) => {
		buffers.delete(url);
		loadStats.failed++;
		loadStats.lastError = `${url.split('/').slice(-2).join('/')}: ${err && (err.name || '')} ${err && (err.message || err)}`.slice(0, 200);
		if (window.PP_DEBUG && loadStats.failed <= 5) console.log('[pp] AUDIO load failed ' + loadStats.lastError);
	});
	buffers.set(url, p);
	return p;
}

// Decode the short UI/effect sounds in the background, a few at a time,
// so the first time each one plays there's no delay.
function warmUp() {
	const urls = [...new Set([...Object.values(BANKS.ui), ...Object.values(BANKS.effect)])];
	let i = 0;
	const next = () => {
		if (i >= urls.length) return;
		const url = urls[i++];
		load(url).catch(() => {}).finally(() => setTimeout(next, 15));
	};
	for (let k = 0; k < 3; k++) next();
}
setTimeout(() => { context(); warmUp(); }, 1500);

/* ------------------------------------------------------------------ effects */
const playing = new Map(); // "origin:sound" -> AudioBufferSourceNode

function start(buffer, origin, key, volume = 1) {
	const c = context();
	if (!c) return;
	// Same as the original: replaying a sound restarts it instead of stacking copies.
	const prev = playing.get(key);
	if (prev) {
		try { prev.stop(); } catch (_) {}
	}
	const src = c.createBufferSource();
	src.buffer = buffer;
	let out = gains[origin] || gains.effect;
	if (volume !== 1) {
		const g = c.createGain();
		g.gain.value = volume;
		g.connect(out);
		out = g;
	}
	src.connect(out);
	src.onended = () => { if (playing.get(key) === src) playing.delete(key); };
	src.start(0);
	playing.set(key, src);
	started[origin in started ? origin : 'effect']++;
}

export function playSound(sound, origin) {
	if (origin === 'music') return playMusic(sound);
	const url = BANKS[origin] && BANKS[origin][sound];
	if (!url) return;
	resume();
	const key = origin + ':' + sound;
	const have = buffers.get(url);
	if (have && !(have instanceof Promise)) {
		start(have, origin, key);
		return;
	}
	// Not decoded yet: play it if it arrives quickly, otherwise skip (a late sound is worse than none).
	const asked = performance.now();
	load(url).then((buffer) => {
		if (performance.now() - asked < 350) start(buffer, origin, key);
	}).catch(() => {});
}

export function crySound(pokemonNumber) {
	const num = String(pokemonNumber).padStart(3, '0');
	const url = `./src/assets/sounds/cries/${num}.wav`;
	resume();
	load(url).then((buffer) => start(buffer, 'effect', 'cry:' + num, 0.5)).catch(() => {});
}

/* ------------------------------------------------------------------ music */
let current = null;      // { name, src, gain }
let wanted = null;       // last track asked for
const FADE_OUT = 0.6;
const FADE_IN = 0.8;

function fadeOutAndStop(track) {
	if (!track || !ctx) return;
	const t = ctx.currentTime;
	track.gain.gain.cancelScheduledValues(t);
	track.gain.gain.setValueAtTime(track.gain.gain.value, t);
	track.gain.gain.linearRampToValueAtTime(0, t + FADE_OUT);
	try { track.src.stop(t + FADE_OUT + 0.05); } catch (_) {}
}

// Keep decoded music for at most a few tracks (a decoded song is ~50 MB).
function trimMusicCache(keepUrl) {
	const musicUrls = new Set(Object.values(BANKS.music));
	const cached = [...buffers.keys()].filter((u) => musicUrls.has(u) && u !== keepUrl);
	while (cached.length > 1) buffers.delete(cached.shift());
}

export function playMusic(trackName) {
	const url = BANKS.music[trackName];
	if (!url) return;
	if (wanted === trackName) return;
	wanted = trackName;
	resume();

	const old = current;
	current = null;
	fadeOutAndStop(old);

	load(url).then((buffer) => {
		if (wanted !== trackName) return; // another track was requested meanwhile
		const c = context();
		const src = c.createBufferSource();
		src.buffer = buffer;
		src.loop = true;
		const gain = c.createGain();
		gain.gain.setValueAtTime(0, c.currentTime);
		gain.gain.linearRampToValueAtTime(1, c.currentTime + FADE_IN);
		src.connect(gain);
		gain.connect(gains.music);
		src.start(0);
		started.music++;
		current = { name: trackName, src, gain };
		trimMusicCache(url);
	}).catch(() => {
		if (wanted === trackName) wanted = null;
	});
}
