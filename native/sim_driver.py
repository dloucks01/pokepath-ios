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


def main():
    note("waiting for the game to load")
    if not wait_target("start", 150):
        note("START never appeared")
    shot("loaded")
    calibrate()
    shot("after-calibration")

    tap("start", settle=2)
    shot("after-start")
    note(f"tutorial NEXT visible: {bool(wait_target('next', 10))}")

    for _ in range(10):
        if "next" in targets():
            tap("next", settle=1.0)
        elif "end" in targets():
            tap("end", settle=1.5)
            break
        else:
            break
    shot("after-tutorial")

    # Deploy the first team Pokémon onto the map, then start a wave.
    tap("teamSlot1", settle=1.0)
    canvas = targets().get("canvas")
    if canvas:
        before = len(console_lines())
        px, py = MAP(canvas[0] - 120, canvas[1] - 100)
        raw_tap(px, py)
        time.sleep(1.0)
        note("placement tap: " + " | ".join(l.split("[pp] ", 1)[1] for l in console_lines()[before:] if "[pp] " in l and "click" in l))
    shot("after-place")

    tap("nextWave", settle=2)
    time.sleep(10)
    shot("wave-running")

    # Long-press the map centre (right-click equivalent).
    if canvas:
        px, py = MAP(*canvas)
        before = len(console_lines())
        raw_tap(px, py, hold=0.8)
        time.sleep(1.5)
        note("long-press map: " + " | ".join(l.split("[pp] ", 1)[1] for l in console_lines()[before:] if "[pp] " in l)[:600])
        shot("after-long-press")
        tap("menuDock", settle=1.5)  # ☰ = Esc: closes the details window
        shot("after-menu-button")

    time.sleep(20)
    shot("wave-later")


if __name__ == "__main__":
    try:
        main()
    finally:
        (OUT / "steps.txt").write_text("\n".join(STEPS) + "\n")
