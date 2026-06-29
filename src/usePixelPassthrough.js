import { useEffect, useRef } from "react";
import { getCurrentWindow, cursorPosition } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();
const ALPHA_THRESHOLD = 10; // alpha <= this counts as "transparent" -> click through

/**
 * Per-pixel click-through (PRD 4.6).
 *
 * Once the window ignores cursor events it stops receiving DOM mouse events, so
 * DOM listeners can't tell when the cursor returns over the sprite. Instead we
 * poll the OS cursor position (which works regardless of passthrough), map it to
 * the pixel of the currently displayed frame, and enable passthrough only when
 * that pixel is transparent.
 *
 * `getState()` must return the live render state:
 *   { enabled, dragging, frame, flip, x, y, w, h, spriteSheet }
 */
export function usePixelPassthrough(getState) {
  const stateRef = useRef(getState);
  stateRef.current = getState;

  // Alpha map of the whole sprite sheet (RGBA bytes) for the current sprite.
  const alphaRef = useRef(null);
  const loadedSheetRef = useRef(null);

  // Cached window geometry (physical top-left + DPI scale).
  const geomRef = useRef({ x: 0, y: 0, scale: 1 });
  const refreshGeom = async () => {
    try {
      const pos = await appWindow.outerPosition();
      const scale = await appWindow.scaleFactor();
      geomRef.current = { x: pos.x, y: pos.y, scale };
    } catch {
      /* window may be closing */
    }
  };

  useEffect(() => {
    let stopped = false;
    let ignoring = false;
    let ticks = 0;

    const setIgnore = (next) => {
      if (next !== ignoring) {
        ignoring = next;
        appWindow.setIgnoreCursorEvents(next).catch(() => {});
      }
    };

    // (Re)load the sprite sheet into an offscreen canvas when it changes.
    const ensureAlphaMap = (spriteSheet) => {
      if (loadedSheetRef.current === spriteSheet) return;
      loadedSheetRef.current = spriteSheet;
      alphaRef.current = null;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (loadedSheetRef.current !== spriteSheet) return; // superseded
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
        try {
          const id = ctx.getImageData(0, 0, c.width, c.height);
          alphaRef.current = { data: id.data, width: c.width, height: c.height };
        } catch {
          alphaRef.current = null;
        }
      };
      img.src = spriteSheet;
    };

    const isTransparentUnderCursor = async () => {
      const s = stateRef.current();
      ensureAlphaMap(s.spriteSheet);
      const alpha = alphaRef.current;
      if (!alpha) return false; // not loaded yet -> stay interactive

      let cur;
      try {
        cur = await cursorPosition();
      } catch {
        return false;
      }
      const { x: wx, y: wy, scale } = geomRef.current;
      const relX = (cur.x - wx) / scale; // window-local CSS px
      const relY = (cur.y - wy) / scale;

      const innerW = window.innerWidth;
      const innerH = window.innerHeight;
      const fw = s.w;
      const fh = s.h;
      const spriteScale = Math.min(innerW / fw, innerH / fh); // must match Sprite render
      const spriteLeft = (innerW - fw * spriteScale) / 2;
      const spriteTop = (innerH - fh * spriteScale) / 2;

      let lx = (relX - spriteLeft) / spriteScale;
      const ly = (relY - spriteTop) / spriteScale;
      if (lx < 0 || ly < 0 || lx >= fw || ly >= fh) return true; // outside the sprite box
      if (s.flip) lx = fw - 1 - lx;

      // Map into the sheet using the animation's rectangle (x,y) + current frame.
      const col = s.frame % Math.max(1, s.framesX || 1);
      const row = Math.floor(s.frame / Math.max(1, s.framesX || 1));
      const sx = Math.floor(s.x + col * fw + lx);
      const sy = Math.floor(s.y + row * fh + ly);
      if (sx < 0 || sy < 0 || sx >= alpha.width || sy >= alpha.height) return true;

      const a = alpha.data[(sy * alpha.width + sx) * 4 + 3];
      return a <= ALPHA_THRESHOLD;
    };

    const loop = async () => {
      if (stopped) return;
      const s = stateRef.current();

      if (!s.enabled || s.dragging) {
        // Feature off, or mid-drag: keep the window fully interactive.
        setIgnore(false);
      } else {
        if (ticks++ % 30 === 0) await refreshGeom(); // catch external moves (~0.5s)
        try {
          setIgnore(await isTransparentUnderCursor());
        } catch {
          setIgnore(false);
        }
      }

      if (!stopped) setTimeout(loop, 16); // ~60 Hz, no overlapping calls
    };

    refreshGeom().then(loop);

    return () => {
      stopped = true;
      appWindow.setIgnoreCursorEvents(false).catch(() => {});
    };
  }, []);

  // Let callers refresh geometry immediately (e.g. right after a drag).
  return refreshGeom;
}
