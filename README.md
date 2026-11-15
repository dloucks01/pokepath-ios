# PokéPath TD for iPhone (native app)

This repository turns the Windows release of **PokéPath TD** into a **native iPhone app that plays fully offline**. The whole game (146 MB) is bundled inside the app.

You don't need a Mac. GitHub builds the app on a cloud Mac, and you install it from your Windows PC with **Sideloadly**.

## Install it on your iPhone

**One-time setup on the PC**

1. Install [Sideloadly](https://sideloadly.io/). Its site also links the non-Microsoft-Store versions of **iTunes** and **iCloud**, which it needs to talk to the iPhone.

**Every time you install or update**

1. Download `PokePathTD.ipa` from this repository's **Releases → latest** (on the right side of the GitHub page).
2. Connect the iPhone by USB and unlock it. Choose **Trust This Computer** if asked.
3. Open Sideloadly, drag `PokePathTD.ipa` into it, enter your **Apple ID**, and click **Start**.
4. **First time only, on the iPhone:**
   - **Settings → Privacy & Security → Developer Mode → On.** The phone restarts; confirm when asked.
   - **Settings → General → VPN & Device Management →** tap your Apple ID **→ Trust**.
5. Open **PokéPath** from the Home Screen.

> **Free Apple ID:** the app stops opening after **7 days**. Re-run step 3 (or turn on Sideloadly's automatic refresh over Wi-Fi). Re-installing over the existing app **keeps your save**.
> **Paid Apple Developer account ($99/yr):** the app lasts a year.

## Playing on a touchscreen

| On PC | On iPhone |
| --- | --- |
| Click | Tap |
| Right-click a Pokémon on the map (details) | **Long-press** it (with a light haptic tick) |
| Hover for tooltips (items, achievements, keywords) | **Long-press**; the next touch hides it |
| Double-click | Double-tap |
| Drag Pokémon / items | Drag |
| `Esc` (back / menu) | **☰** button, bottom-left |
| `X` (show ranges) | **◎** button, bottom-left |
| Mouse-drag / scroll on big maps | Drag the empty map |

Pause, speed, auto-wave, next wave and the team buttons are already on screen.

**What's different from the PC version:**

- Full screen, landscape only. The status bar and home bar are hidden. A swipe from a screen edge needs a second swipe, so dragging near the edges doesn't throw you out of the game.
- Leaving the app or locking the phone **pauses a running wave**.
- Volume sliders and music fades work. iOS normally breaks both for web games.
- The launch screen and app icon use the game's own art.
- The phone's silent switch mutes the game.

## Moving your save from the PC

1. On the PC, in the game: **Menu → Export data**. Download `PokePathSave.txt` or copy the code.
2. On the iPhone, in the game: **Menu → Import data**. Upload the file (send it over first via iCloud Drive, AirDrop or email) or paste the code.

The save lives inside the app, so **deleting the app deletes the save**. Export it now and then.

## Updating to a new PokéPath version

On the PC, in this folder (needs [Node.js](https://nodejs.org), [7-Zip](https://www.7-zip.org/), and Python with Pillow for the artwork):

```bash
npm install
```

```bash
node tools/build.mjs "D:\path\to\PokéPath TD Setup.exe"
```

Set `"version"` in `package.json` to the new game version, then commit and push:

```bash
git add -A && git commit -m "Update to PokéPath vX.Y" && git push
```

GitHub rebuilds the app (about 10–15 minutes; see the **Actions** tab) and replaces the **latest** release. Install the new `.ipa` with Sideloadly over the old one; your save is kept.

The build script accepts the installer `.exe`, the `.zip` it came in, an installed copy's folder, or `resources/app.asar`. With no argument it uses the newest `*Setup*.exe` or `.zip` in the parent folder. It prints a ⚠ warning if a new game version changes code the iPhone patches depend on.

## Trying it on the PC first

```bash
npm run serve
```

This serves the game at http://localhost:8080, with the same touch layer the iPhone app uses.

## How it works

| Path | What it is |
| --- | --- |
| `tools/build.mjs` | Pulls the game out of the Windows installer into `www/` and patches it for iPhone |
| `shim/ios-shim.js`, `shim/ios-shim.css` | Touch controls, audio fixes, auto-pause, haptics, layout |
| `native/configure-ios.sh` | Sets up the Xcode project: landscape lock, fullscreen, icon, launch screen, `GameViewController` |
| `native/GameViewController.swift` | Hides the status bar and home indicator, defers edge gestures, no bounce |
| `capacitor.config.json` | [Capacitor](https://capacitorjs.com) app settings (bundle id `local.pokepath.td`) |
| `.github/workflows/ios-ipa.yml` | Cloud Mac build: unsigned `.ipa`, published as the **latest** release |
| `www/` | The patched game, bundled into the app |
| `shim/sw.js` | Offline cache for an optional browser version (not used by the native app) |

On a Mac you can open it in Xcode instead: `npm ci && npx cap add ios && npx cap sync ios && bash native/configure-ios.sh && npx cap open ios`.

## Known limitations

- The game is designed at 1238×674, so on a phone it is scaled to about 65 % and text is small.
- The Windows auto-updater is removed. To update, rebuild from the new installer.

---

PokéPath TD is a free fan game by Khydra (github.com/Khydra/PokePath-TD). This repackaging is for playing your own copy on your own phone.
