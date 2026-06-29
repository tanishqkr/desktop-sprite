import { useEffect, useReducer, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import {
  Menu,
  MenuItem,
  CheckMenuItem,
  PredefinedMenuItem,
  Submenu,
} from "@tauri-apps/api/menu";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

import Sprite from "./Sprite";
import { petReducer, STATES } from "./StateMachine";
import { useAnimationFrame } from "./useAnimationFrame";
import { usePixelPassthrough } from "./usePixelPassthrough";
import { DEFAULT_CONFIG, loadConfig, CONFIG_EVENT } from "./config";
import "./App.css";

// Build + show a NATIVE context menu. A native menu renders in its own OS
// surface, so (unlike an HTML overlay) it is never clipped by the tiny
// 128x128 pet window.
async function showPetMenu() {
  let launchEnabled = false;
  try {
    launchEnabled = await isEnabled();
  } catch {
    /* autostart may be unavailable in some environments */
  }

  const launch = await CheckMenuItem.new({
    id: "launch",
    text: "Launch at login",
    checked: launchEnabled,
    action: async () => {
      try {
        if (await isEnabled()) await disable();
        else await enable();
      } catch {
        /* ignore */
      }
    },
  });

  const about = await Submenu.new({
    text: "About",
    items: [
      await MenuItem.new({ text: "Desktop Pet  v0.1.0", enabled: false }),
      await MenuItem.new({ text: "A lightweight desktop companion", enabled: false }),
    ],
  });

  const control = await MenuItem.new({
    text: "Open Control Panel",
    action: () => invoke("open_control"),
  });

  const sep = await PredefinedMenuItem.new({ item: "Separator" });
  const quit = await MenuItem.new({
    text: "Quit",
    action: () => invoke("quit_app"),
  });

  const menu = await Menu.new({ items: [control, launch, about, sep, quit] });
  await menu.popup();
}

const appWindow = getCurrentWindow();
const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag

function App() {
  const [state, send] = useReducer(petReducer, STATES.IDLE);
  const [frame, setFrame] = useState(0);
  const [flip, setFlip] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [, forceTick] = useReducer((x) => x + 1, 0); // re-render on window resize

  // Load persisted config on mount, then update live when the control panel
  // broadcasts a change.
  useEffect(() => {
    loadConfig().then(setConfig);
    const unlisten = [];
    listen(CONFIG_EVENT, (e) => setConfig(e.payload)).then((u) => unlisten.push(u));
    // Live size feedback while the Control Panel slider is being dragged.
    listen("pet://size", (e) => {
      const s = e.payload;
      appWindow.setSize(new LogicalSize(s, s)).catch(() => {});
    }).then((u) => unlisten.push(u));
    return () => unlisten.forEach((u) => u());
  }, []);

  const { fps, animations } = config;
  const petSize = config.petSize ?? 128;
  const anim = animations[state] || animations.idle;

  // Resize the pet window to the configured size.
  useEffect(() => {
    appWindow.setSize(new LogicalSize(petSize, petSize)).catch(() => {});
  }, [petSize]);

  // Recompute scale whenever the window is resized.
  useEffect(() => {
    window.addEventListener("resize", forceTick);
    return () => window.removeEventListener("resize", forceTick);
  }, []);

  // Fit the current frame inside the window: downscale frames larger than the
  // window, upscale smaller ones (e.g. 64px frame in a 128px window = 2x).
  const scale = Math.min(window.innerWidth / anim.w, window.innerHeight / anim.h);

  // Keep the latest state available inside the rAF loop without restarting it.
  const stateRef = useRef(state);
  stateRef.current = state;

  // --- Frame stepping, capped to fps ---
  useAnimationFrame(() => {
    const current = animations[stateRef.current];
    const totalFrames = (current.framesX || 1) * (current.framesY || 1);
    setFrame((f) => (f + 1) % totalFrames);
  }, fps);

  // Restart each animation from frame 0 when the state changes.
  useEffect(() => {
    setFrame(0);
  }, [state]);

  // "react" plays once: when its last frame has shown, return to idle.
  useEffect(() => {
    const totalFrames = (animations.react.framesX || 1) * (animations.react.framesY || 1);
    if (state === STATES.REACT && frame === totalFrames - 1) {
      const t = setTimeout(() => send("animationComplete"), 1000 / fps);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state, frame, animations, fps]);

  // --- Drag to reposition the OS window (PRD 4.5) ---
  const drag = useRef(null);

  // --- Per-pixel click-through (PRD 4.6) ---
  const refreshPassthroughGeom = usePixelPassthrough(() => ({
    enabled: config.clickThrough ?? true,
    dragging: drag.current !== null,
    frame,
    flip,
    x: anim.x,
    y: anim.y,
    w: anim.w,
    h: anim.h,
    framesX: anim.framesX,
    framesY: anim.framesY,
    spriteSheet: config.spriteSheet,
  }));

  const onPointerDown = async (e) => {
    if (e.button !== 0) return; // left button only
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = await appWindow.outerPosition();
    const factor = await appWindow.scaleFactor();
    drag.current = {
      startX: e.screenX,
      startY: e.screenY,
      winX: pos.x,
      winY: pos.y,
      factor,
      moved: false,
    };
  };

  const onPointerMove = async (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.screenX - d.startX;
    const dy = e.screenY - d.startY;

    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      d.moved = true;
      send("dragStart"); // idle->walk
    }
    if (d.moved) {
      if (dx < -1) setFlip(true);
      else if (dx > 1) setFlip(false);
      // screenX/Y are CSS px; window position is physical px.
      await appWindow.setPosition(
        new PhysicalPosition(
          Math.round(d.winX + dx * d.factor),
          Math.round(d.winY + dy * d.factor),
        ),
      );
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      send("dragEnd"); // walk->idle
      refreshPassthroughGeom(); // window moved — refresh cached geometry
    } else {
      send("click"); // idle->react
    }
  };

  // --- Right-click -> native context menu (not clipped by the tiny window) ---
  const onContextMenu = (e) => {
    e.preventDefault();
    showPetMenu();
  };

  return (
    <div
      className="pet-root"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
    >
      <Sprite
        spriteSheet={config.spriteSheet}
        x={anim.x}
        y={anim.y}
        w={anim.w}
        h={anim.h}
        frame={frame}
        framesX={anim.framesX}
        scale={scale}
        flip={flip}
      />
    </div>
  );
}

export default App;
