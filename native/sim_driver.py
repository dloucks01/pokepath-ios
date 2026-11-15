#!/usr/bin/env python3
"""Drives PokéPath TD in the iOS Simulator with real (simulated-finger) taps.

Uses Meta's idb to read the accessibility tree (to find on-screen text such as
"START") and to tap/hold at those positions, and `xcrun simctl` for screenshots.
Writes everything into the output folder; never fails the CI job on its own.

usage: sim_driver.py <udid> <out_dir>
"""
import json
import subprocess
import sys
import time
from pathlib import Path

UDID, OUT = sys.argv[1], Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
STEPS = []


def run(*cmd, timeout=60):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except Exception as exc:  # noqa: BLE001 - report and continue
        return 1, "", str(exc)


def note(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    STEPS.append(line)


def shot(name):
    path = OUT / f"{len(list(OUT.glob('*.png'))):02d}-{name}.png"
    run("xcrun", "simctl", "io", UDID, "screenshot", str(path))
    note(f"screenshot {path.name}")


def elements():
    code, out, err = run("idb", "ui", "describe-all", "--udid", UDID, "--json", timeout=90)
    if code != 0:
        note(f"describe-all failed: {err.strip()[:300]}")
        return []
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        data = [json.loads(line) for line in out.splitlines() if line.strip().startswith("{")]
    return data if isinstance(data, list) else [data]


def label_of(el):
    return " ".join(str(el.get(k) or "") for k in ("AXLabel", "AXValue", "title")).strip()


def find(text, exact=True):
    want = text.upper()
    for el in elements():
        lab = label_of(el).upper()
        if (lab == want) if exact else (want in lab):
            f = el.get("frame") or {}
            if f.get("width", 0) > 0 and f.get("height", 0) > 0:
                return f["x"] + f["width"] / 2, f["y"] + f["height"] / 2, label_of(el)
    return None


def tap_text(text, exact=True, hold=None, settle=1.5):
    hit = find(text, exact)
    if not hit:
        note(f"TAP '{text}': not found on screen")
        return False
    x, y, lab = hit
    cmd = ["idb", "ui", "tap", "--udid", UDID, f"{x:.0f}", f"{y:.0f}"]
    if hold:
        cmd[3:3] = ["--duration", str(hold)]
    code, _, err = run(*cmd)
    note(f"TAP '{text}' -> '{lab}' at ({x:.0f},{y:.0f}){' hold ' + str(hold) + 's' if hold else ''} rc={code} {err.strip()[:200]}")
    time.sleep(settle)
    return code == 0


def tap_xy(x, y, hold=None, why=""):
    cmd = ["idb", "ui", "tap", "--udid", UDID, f"{x:.0f}", f"{y:.0f}"]
    if hold:
        cmd[3:3] = ["--duration", str(hold)]
    code, _, err = run(*cmd)
    note(f"TAP {why} at ({x:.0f},{y:.0f}) rc={code} {err.strip()[:200]}")


def main():
    note("waiting for the game to load")
    for _ in range(30):
        if find("START"):
            break
        time.sleep(3)
    shot("loaded")

    els = elements()
    (OUT / "accessibility.json").write_text(json.dumps(els, indent=1))
    note(f"{len(els)} accessibility elements; labels: " + ", ".join(sorted({label_of(e) for e in els if label_of(e)})[:60]))

    # 1) START on the profile screen (first-launch flow).
    t0 = time.time()
    tap_text("START")
    shot("after-start")
    note(f"tutorial visible after START: {bool(find('NEXT'))} ({time.time() - t0:.1f}s)")

    # 2) Click through the tutorial.
    for i in range(10):
        if tap_text("NEXT", settle=0.8):
            continue
        if tap_text("END", settle=1.2):
            break
        break
    shot("after-tutorial")

    # 3) Start a wave.
    tap_text("NEXT WAVE", settle=1.0)
    time.sleep(12)
    shot("wave-running")

    # 4) Long-press the middle of the map (right-click equivalent) and a quick tap.
    frame = None
    for el in els:
        f = el.get("frame") or {}
        if f.get("width", 0) > 300 and f.get("height", 0) > 150:
            frame = f
    if frame:
        cx, cy = frame["x"] + frame["width"] / 2, frame["y"] + frame["height"] / 2
        tap_xy(cx, cy, hold=0.8, why="long-press map centre")
        time.sleep(1.5)
        shot("after-long-press")
        tap_xy(cx, cy, why="tap map centre")
        time.sleep(1.5)

    # 5) Let a wave play for a while to watch lag.
    time.sleep(20)
    shot("wave-later")
    (OUT / "steps.txt").write_text("\n".join(STEPS) + "\n")


if __name__ == "__main__":
    try:
        main()
    finally:
        (OUT / "steps.txt").write_text("\n".join(STEPS) + "\n")
