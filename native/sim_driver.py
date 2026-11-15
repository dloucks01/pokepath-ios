#!/usr/bin/env python3
"""Drives PokéPath TD in the iOS Simulator with simulated-finger taps (idb).

The game is a web page, so iOS's accessibility tree doesn't expose its buttons.
Instead the app's diagnostics layer logs button positions ("[pp] TARGETS {...}")
and every input event to the console, which this script reads from the app's
console log. idb taps use the device's portrait coordinates, so the script first
calibrates the portrait -> landscape mapping with two taps.

usage: sim_driver.py <udid> <out_dir> <app_console_log>
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

UDID, OUT, CONSOLE = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
STEPS = []
MAP = None  # function landscape(x, y) -> portrait(x, y)


def run(*cmd, timeout=60):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except Exception as exc:  # noqa: BLE001
        return 1, "", str(exc)


def note(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    STEPS.append(line)


def console_lines():
    try:
        return CONSOLE.read_text(errors="replace").splitlines()
    except FileNotFoundError:
        return []


def targets():
    for line in reversed(console_lines()):
        if "[pp] TARGETS " in line:
            try:
                return json.loads(line.split("[pp] TARGETS ", 1)[1])
            except json.JSONDecodeError:
                return {}
    return {}


def wait_target(name, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        t = targets()
        if name in t:
            return t[name]
        time.sleep(1)
    return None


def shot(name):
    path = OUT / f"{len(list(OUT.glob('*.png'))):02d}-{name}.png"
    run("xcrun", "simctl", "io", UDID, "screenshot", str(path))
    note(f"screenshot {path.name}")


def raw_tap(px, py, hold=None):
    cmd = ["idb", "ui", "tap", "--udid", UDID]
    if hold:
        cmd += ["--duration", str(hold)]
    cmd += [f"{px:.0f}", f"{py:.0f}"]
    return run(*cmd)


def last_pointerdown(after_index):
    lines = console_lines()[after_index:]
    for line in lines:
        m = re.search(r"pointerdown \((-?\d+),(-?\d+)\)", line)
        if m:
            return int(m.group(1)), int(m.group(2))
    return None


def calibrate():
    """Tap two portrait points and see where the page reports them (landscape)."""
    global MAP
    samples = []
    # Both points land in the black side margins next to the game, so they press nothing.
    for px, py in ((220, 30), (120, 930)):
        before = len(console_lines())
        raw_tap(px, py)
        time.sleep(1.5)
        got = last_pointerdown(before)
        note(f"calibration tap portrait ({px},{py}) -> page {got}")
        if got:
            samples.append(((px, py), got))
    if len(samples) < 2:
        note("calibration failed - assuming landscape-right")
        MAP = lambda x, y: (440 - y, x)  # noqa: E731
        return
    (p1, l1), (p2, l2) = samples
    # Landscape x follows portrait y or x (and maybe reversed); fit both axes.
    if abs(l2[0] - l1[0]) > abs(l2[1] - l1[1]) and abs(p2[1] - p1[1]) > 0:
        # lx depends on py, ly depends on px
        ax = (l2[0] - l1[0]) / (p2[1] - p1[1]); bx = l1[0] - ax * p1[1]
        ay = (l2[1] - l1[1]) / (p2[0] - p1[0]); by = l1[1] - ay * p1[0]
        MAP = lambda x, y: ((y - by) / ay, (x - bx) / ax)  # noqa: E731
    else:
        ax = (l2[0] - l1[0]) / (p2[0] - p1[0]); bx = l1[0] - ax * p1[0]
        ay = (l2[1] - l1[1]) / (p2[1] - p1[1]); by = l1[1] - ay * p1[1]
        MAP = lambda x, y: ((x - bx) / ax, (y - by) / ay)  # noqa: E731
    note("calibration done")


def tap(name, hold=None, settle=1.5):
    pos = targets().get(name)
    if not pos:
        note(f"TAP {name}: not on screen")
        return False
    px, py = MAP(*pos)
    before = len(console_lines())
    t = time.time()
    raw_tap(px, py, hold)
    time.sleep(settle)
    events = [l.split("[pp] ", 1)[1] for l in console_lines()[before:] if "[pp] " in l and ("down" in l or "click" in l or "BLOCKED" in l)]
    note(f"TAP {name} page{tuple(pos)} portrait({px:.0f},{py:.0f}){' hold' if hold else ''}: " + " | ".join(events[:6]))
    return True


RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append(f"{'PASS' if ok else 'FAIL'}  {name}{('  - ' + detail) if detail else ''}")
    note(f"CHECK {name}: {'PASS' if ok else 'FAIL'} {detail}")


def state():
    return targets().get("state", {})


def wait_state(key, value, timeout=6):
    end = time.time() + timeout
    while time.time() < end:
        if state().get(key) == value:
            return True
        time.sleep(0.5)
    return False


def sound_lines():
    out = []
    for line in console_lines():
        if "[pp] STATUS" in line and "sound={" in line:
            try:
                out.append(json.loads(line.split("sound=", 1)[1].split(" counts=", 1)[0]))
            except json.JSONDecodeError:
                pass
    return out


def tap_point(point, hold=None, why=""):
    px, py = MAP(*point)
    before = len(console_lines())
    raw_tap(px, py, hold)
    time.sleep(1.2)
    ev = [l.split("[pp] ", 1)[1] for l in console_lines()[before:] if "[pp] " in l and ("down" in l or "click" in l)]
    note(f"TAP {why} page{tuple(point)}{' hold ' + str(hold) + 's' if hold else ''}: " + " | ".join(ev[:5]))


def main():
    note("waiting for the game to load")
    t_launch = time.time()
    if not wait_target("start", 150):
        note("START never appeared")
    check("game loads to the profile screen", "start" in targets(), f"{time.time() - t_launch:.0f}s after launch")
    shot("loaded")
    calibrate()

    tap("start", settle=2)
    check("START opens the tutorial", bool(wait_target("next", 10)))
    for _ in range(10):
        if "next" in targets():
            tap("next", settle=1.0)
        elif "end" in targets():
            tap("end", settle=1.5)
            break
        else:
            break
    check("tutorial closes", "next" not in targets() and "end" not in targets())
    shot("after-tutorial")

    # --- Place the first team Pokémon on a valid tile (tap slot, then tap tile).
    tap("deploy1", settle=1.0)  # the small red deploy button in the team slot
    check("red deploy button starts placing", wait_state("deploying", True, 3))
    tap("menuDock", settle=1.0)  # ☰ = Esc cancels placing
    check("☰ button cancels placing", wait_state("deploying", False, 3))
    tap("sprite1", settle=1.0)  # touch shortcut: tap the Pokémon's picture
    check("tapping the team Pokémon's picture starts placing", wait_state("deploying", True, 3))
    tile = targets().get("freeTile")
    if tile:
        tap_point(tile, why="free tile")
        check("tapping a valid tile places the Pokémon", wait_state("towers", 1, 4), f"state={state()}")
    else:
        check("tapping a valid tile places the Pokémon", False, "no free tile reported")
    shot("placed")

    # --- Long-press the placed Pokémon: details window, and it must not get picked up/moved.
    tower = targets().get("tower")
    if tower:
        tap_point(tower, hold=0.9, why="long-press tower")
        ok = wait_state("details", True, 4)
        check("long-press on a placed Pokémon opens its details", ok, f"state={state()}")
        check("long-press doesn't move or remove the Pokémon", state().get("towers") == 1 and targets().get("tower") == tower)
        shot("details")
        tap("menuDock", settle=1.5)
        check("☰ button closes the details window", wait_state("details", False, 4))
    else:
        check("long-press on a placed Pokémon opens its details", False, "no tower on the map")

    # --- Drag the placed Pokémon to another free tile.
    tower = targets().get("tower")
    dest = targets().get("freeTile")
    if tower and dest:
        a, b = MAP(*tower), MAP(*dest)
        before = len(console_lines())
        run("idb", "ui", "swipe", "--udid", UDID, "--duration", "0.8", "--delta", "8",
            f"{a[0]:.0f}", f"{a[1]:.0f}", f"{b[0]:.0f}", f"{b[1]:.0f}")
        time.sleep(1.5)
        moved_to = targets().get("tower")
        note("drag events: " + " | ".join(l.split("[pp] ", 1)[1] for l in console_lines()[before:] if "[pp] " in l and ("down" in l or "up" in l))[:400])
        check("dragging a placed Pokémon moves it", state().get("towers") == 1 and moved_to == dest, f"from {tower} to {dest}, now at {moved_to}")
        shot("dragged")

    # --- Tooltips: Profile screen, long-press an achievement.
    tap("profileIcon", settle=1.5)
    check("profile icon opens Profile", wait_state("profile", True, 4))
    ach = wait_target("achievement", 5)
    if ach:
        tap_point(ach, why="quick tap achievement")
        check("a quick tap does NOT show a tooltip", not state().get("tooltip"))
        tap_point(ach, hold=0.9, why="long-press achievement")
        check("long-press shows the tooltip", wait_state("tooltip", True, 3))
        shot("tooltip")
        tap_point(ach, why="tap to dismiss")
        check("next touch hides the tooltip", wait_state("tooltip", False, 3))
    else:
        check("long-press shows the tooltip", False, "no achievement on screen")
    tap("menuDock", settle=1.5)
    check("☰ button closes Profile", wait_state("profile", False, 4))

    # --- Wave + sound.
    tap("nextWave", settle=2)
    check("NEXT WAVE starts a wave", wait_state("wave", True, 5))
    time.sleep(15)
    shot("wave")
    sounds = sound_lines()
    last = sounds[-1] if sounds else {}
    peak = {k: max((s.get("peak", {}).get(k, 0) for s in sounds), default=0) for k in ("ui", "effect", "music")}
    note(f"sound summary: last={last} peaks={peak}")
    check("audio engine running", last.get("state") == "running", f"state={last.get('state')} time={last.get('time')}s")
    check("sound files load and decode", last.get("loaded", 0) > 10 and last.get("failed", 0) == 0, f"loaded={last.get('loaded')} failed={last.get('failed')} lastError={last.get('lastError')}")
    check("UI sounds produce audio signal", peak["ui"] > 0.001, f"peak={peak['ui']} started={last.get('started', {}).get('ui')}")
    check("music plays", peak["music"] > 0.001, f"peak={peak['music']} track={last.get('music')}")
    check("battle sound effects produce audio signal", peak["effect"] > 0.001, f"peak={peak['effect']} started={last.get('started', {}).get('effect')}")

    # --- Lag over the whole run.
    lags = [int(m.group(1)) for l in console_lines() for m in [re.search(r"lagMax5s=(\d+)ms", l)] if m]
    after_load = lags[1:] if len(lags) > 1 else lags
    worst = max(after_load, default=0)
    check("no main-thread stall over 250 ms after loading", worst <= 250, f"worst={worst}ms over {len(after_load) * 5}s")
    errs = [l for l in console_lines() if "[pp] ERROR" in l]
    check("no JavaScript errors", not errs, "; ".join(e.split("ERROR", 1)[1].strip()[:120] for e in errs[:3]))


if __name__ == "__main__":
    try:
        main()
    finally:
        (OUT / "steps.txt").write_text("\n".join(STEPS) + "\n")
        (OUT / "results.txt").write_text("\n".join(RESULTS) + "\n")
        print("\n=== RESULTS ===\n" + "\n".join(RESULTS))
