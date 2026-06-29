// Shared pet configuration: defaults, persistence (Tauri store), and the
// event name used to broadcast live changes from the control panel to the pet.
//
// Animation model: each animation is a rectangle on the sheet
//   { x, y, w, h, frames }
// where (x,y) is the top-left of frame 0, w/h is the frame size, and `frames`
// frames are laid out left-to-right stepping by w. Per-animation rectangles let
// each row have its own position/size, which AI-generated sheets often need.

import { load } from "@tauri-apps/plugin-store";
import bundledDefaults from "./pet.config.json";

export const CONFIG_EVENT = "pet://config";
export const ANIM_KEYS = ["idle", "walk", "react"];
const STORE_FILE = "pet.config.dat";
const STORE_KEY = "petConfig";

export const DEFAULT_CONFIG = {
  spriteSheet: bundledDefaults.spriteSheet,
  fps: bundledDefaults.fps,
  clickThrough: bundledDefaults.clickThrough ?? true,
  petSize: bundledDefaults.petSize ?? 128,
  animations: bundledDefaults.animations,
};

// Convert an old-format config ({row,frames} + top-level frameWidth/frameHeight)
// to the per-animation rectangle model.
function migrate(cfg) {
  const out = { ...DEFAULT_CONFIG, ...cfg };
  const fw = cfg.frameWidth ?? 64;
  const fh = cfg.frameHeight ?? 64;
  const anims = cfg.animations || {};
  const migrated = {};
  for (const key of ANIM_KEYS) {
    const a = anims[key] || DEFAULT_CONFIG.animations[key];
    if (a && a.w != null && a.h != null) {
      migrated[key] = { 
        x: a.x ?? 0, 
        y: a.y ?? 0, 
        w: a.w, 
        h: a.h, 
        framesX: a.framesX ?? a.frames ?? 1, 
        framesY: a.framesY ?? 1 
      };
    } else {
      // old {row, frames}
      migrated[key] = {
        x: 0,
        y: (a?.row ?? 0) * fh,
        w: fw,
        h: fh,
        framesX: a?.framesX ?? a?.frames ?? 1,
        framesY: a?.framesY ?? 1,
      };
    }
  }
  out.animations = migrated;
  delete out.frameWidth;
  delete out.frameHeight;
  return out;
}

let storePromise;
function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: false });
  }
  return storePromise;
}

/** Load the saved config (migrated + merged over defaults), or defaults. */
export async function loadConfig() {
  try {
    const store = await getStore();
    const saved = await store.get(STORE_KEY);
    if (saved) return migrate(saved);
  } catch {
    /* store unavailable — use defaults */
  }
  return DEFAULT_CONFIG;
}

/** Persist the config to disk. */
export async function saveConfig(cfg) {
  const store = await getStore();
  await store.set(STORE_KEY, cfg);
  await store.save();
}
