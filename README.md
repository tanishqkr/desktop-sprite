# Desktop Pet

A lightweight, always-on-top desktop companion built with **Tauri 2 + React**. It
renders a custom 2D sprite inside a transparent, borderless window that floats above
your other apps. The sprite plays **idle / walk / react** animations driven by
a small finite state machine. Bring your own sprite sheet — no code changes needed.

## Features (v1)

- Transparent, borderless, always-on-top pet window with no taskbar footprint
- **Control Panel** window (opens on launch) to upload a sprite sheet, slice frames,
  set FPS, resize/move the pet, and toggle options
- Settings **persist to disk** (Tauri store plugin) and apply to the live pet instantly
- Sprite-sheet animation via CSS `background-position` stepping, capped to a configured FPS
- Hand-rolled state machine: `idle → walk → react`
- **Per-pixel click-through** — clicks on the sprite's transparent pixels pass
  through to the app behind; only the drawn pixels are interactive (toggleable)
- **Drag** the pet to reposition (plays `walk` and flips to face its direction)
- **Click** the pet to trigger a `react` animation
- **System tray** with a native menu (Open Control Panel / Show Pet / Hide Pet / Quit)
- **Right-click** the pet for a native menu (Open Control Panel / Launch at login / About / Quit)
- **Launch at login** toggle (via the autostart plugin)

## Opening & closing the pet

The app has two windows: the floating **pet** and the **Control Panel**.

| Action | How |
| --- | --- |
| **Start the app** | Launch it — the Control Panel opens and the pet appears on screen |
| **Show / hide the pet** | Control Panel → *Show pet* / *Hide pet*, or the tray menu |
| **Reopen the Control Panel** | Left-click the tray icon, or tray menu → *Open Control Panel*, or right-click the pet → *Open Control Panel* |
| **Close the Control Panel** | Click its **✕** — this only hides it to the tray; the pet keeps running |
| **Quit the whole app** | Control Panel → *Quit app*, tray menu → *Quit*, or right-click the pet → *Quit* |

The app lives in the **system tray** — closing the Control Panel does not quit it.
Use *Quit* to exit completely.

## Using the Control Panel

- **Upload sprite sheet** — pick a PNG; it applies to the pet immediately and is saved
- **Frame slicer** — per animation, drag a box over its frames; set FPS
- **Animations** — idle / walk / react, each with its own frame rectangle
- **Position** — type X/Y and *Move pet here*, *Center on screen*, or *Read current*
- **Save & apply** — persists everything and updates the live pet
- **Reset to defaults** — restores the bundled placeholder sprite + settings

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri 2 (Rust) |
| Frontend | React 19 + Vite 7 |
| Animation | CSS `background-position` stepping + `requestAnimationFrame` |
| State machine | Hand-rolled FSM (`src/StateMachine.js`) |
| Config | JSON (`src/pet.config.json`) |
| Persistence | `tauri-plugin-store` (config saved to disk) |
| Package manager | pnpm |
| Plugins | `tauri-plugin-autostart`, `tauri-plugin-store` |

## Prerequisites

- **Node** 18+ and **pnpm**
- **Rust** (stable)

Platform toolchains:

| OS | Needs |
| --- | --- |
| **Windows** | MSVC toolchain + **Visual Studio C++ Build Tools**; **WebView2** runtime (ships with Windows 11) |
| **macOS** | **Xcode Command Line Tools** (`xcode-select --install`); WebKit ships with the OS. macOS **10.15+** |

> macOS builds must be produced **on a Mac** — Tauri does not cross-compile the
> `.app`/`.dmg` from Windows.

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Build a release binary

```bash
pnpm tauri build
```

Output goes to `src-tauri/target/release/` (and bundles under `bundle/`):
Windows `.exe` / `.msi`, macOS `.app` / `.dmg`.

### Cross-platform notes

The frontend is identical on every OS. Native window behavior differs:

- **Windows** — `alwaysOnTop` + `skipTaskbar` (set in `tauri.conf.json`) keep the pet
  floating with no taskbar entry.
- **macOS** — `src-tauri/src/lib.rs` adds `#[cfg(target_os = "macos")]` setup that runs
  the app as an **accessory** (no Dock icon, no menu bar) and gives the pet window the
  `canJoinAllSpaces | stationary | fullScreenAuxiliary` collection behavior, so it shows
  on every Space and floats above full-screen apps. This needs the `macos-private-api`
  feature (already enabled) for the transparent window. Distributing outside your own Mac
  additionally requires **code signing + notarization** (an Apple Developer account);
  unsigned `.app`s open via right-click → *Open*.

## Releasing (CI builds for macOS + Windows)

You don't need a Mac to produce a macOS installer. The workflow at
`.github/workflows/release.yml` builds **both** OSes on GitHub's free runners and
attaches the installers to a GitHub Release. Trigger it by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

(You can also run it manually: GitHub → **Actions** → *Release* → **Run workflow**.)

When the run finishes (~5–10 min), GitHub → **Releases** has a **draft** release with:

- `desktop-pet_<ver>_universal.dmg` — macOS (universal: Apple Silicon + Intel)
- `desktop-pet_<ver>_x64-setup.exe` and `..._x64_en-US.msi` — Windows

Review it and click **Publish release**. To install on a Mac: download the `.dmg`,
drag the app to `/Applications`, and open it the first time via **right-click → Open**
(it's unsigned). Builds are unsigned, so notarization/signing isn't configured — see
the note above if you later distribute publicly.

## Customising your pet

The pet is driven entirely by a sprite sheet + a JSON config.

### Sprite sheet (`public/sprite.png`)

A single PNG laid out as a grid:

- **Each row** = one animation state
- **Each column** = one frame of that animation
- All frames share the same pixel size (e.g. 64×64)
- Export as PNG-32 with transparency

A placeholder sheet (512×256, 64×64 frames) is included so the app runs out of the box.
Replace `public/sprite.png` with your own art.

### Frame slicer (recommended)

Open the **Control Panel → Frame slicer**, pick an animation tab, and **drag a box**
over its first frame on the sheet. The following frames appear as boxes to the right —
line them up with the character, then fine-tune with the X / Y / W / H / Frames inputs.
Each animation has its **own rectangle**, so sheets with uneven rows (common with
AI-generated art) slice correctly. Click **Save & apply**.

### Config model (`src/pet.config.json`)

Each animation is a rectangle on the sheet: `(x, y)` is the top-left of frame 0,
`w`×`h` is the frame size, and `frames` frames are read left-to-right stepping by `w`.

```json
{
  "spriteSheet": "/sprite.png",
  "fps": 8,
  "clickThrough": true,
  "petSize": 128,
  "animations": {
    "idle":  { "x": 0, "y": 0,   "w": 64, "h": 64, "frames": 4 },
    "walk":  { "x": 0, "y": 64,  "w": 64, "h": 64, "frames": 6 },
    "react": { "x": 0, "y": 128, "w": 64, "h": 64, "frames": 5 }
  }
}
```

Saved settings persist to disk; old `{ row, frames }` configs are migrated automatically.

## Project structure

```
desktop-pet/
├── src-tauri/
│   ├── src/lib.rs          # tray icon, native menu, autostart, window commands
│   ├── src/main.rs         # entry point
│   ├── tauri.conf.json     # transparent/always-on-top window + bundle config
│   └── capabilities/       # Tauri 2 permission grants
├── src/
│   ├── main.jsx            # routes window: pet ("main") vs Control Panel ("control")
│   ├── App.jsx             # pet: drag, click, native menu
│   ├── ControlPanel.jsx    # the control panel UI
│   ├── Sprite.jsx          # sprite-sheet frame renderer
│   ├── StateMachine.js     # hand-rolled FSM
│   ├── useAnimationFrame.js# fps-capped rAF hook
│   ├── config.js           # defaults + load/save (store) + live-update event
│   └── pet.config.json     # bundled default animation config
└── public/
    └── sprite.png          # default placeholder sprite sheet
```

## Known limitations / roadmap

- **Per-pixel click-through** polls the OS cursor ~60×/sec to toggle passthrough.
  It can be disabled in the Control Panel (*Click through transparent pixels*),
  which falls back to the whole window being the hit area.
- No in-app sprite editor, sound, multi-pet, or cloud sync (out of scope for v1).
