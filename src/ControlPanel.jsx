import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

import Sprite from "./Sprite";
import { useAnimationFrame } from "./useAnimationFrame";
import { DEFAULT_CONFIG, loadConfig, saveConfig, CONFIG_EVENT, ANIM_KEYS } from "./config";
import "./ControlPanel.css";

export default function ControlPanel() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [autostartOn, setAutostartOn] = useState(false);
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState("idle"); // animation being sliced

  useEffect(() => {
    loadConfig().then(setCfg);
    invoke("get_pet_position").then(([x, y]) => setPos({ x, y })).catch(() => {});
    isEnabled().then(setAutostartOn).catch(() => {});
  }, []);

  const flash = (msg) => {
    setStatus(msg);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => setStatus(""), 1800);
  };

  const update = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const updateAnim = (key, patch) =>
    setCfg((c) => ({
      ...c,
      animations: { ...c.animations, [key]: { ...c.animations[key], ...patch } },
    }));

  const applyAndSave = async (next) => {
    const cur = next || cfg;
    await saveConfig(cur);
    await emit(CONFIG_EVENT, cur);
    flash("Saved & applied");
  };

  // Sprite upload -> data URL
  const onSpriteFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = { ...cfg, spriteSheet: reader.result };
      setCfg(next);
      applyAndSave(next);
    };
    reader.readAsDataURL(file);
  };

  const resetDefaults = () => {
    setCfg(DEFAULT_CONFIG);
    applyAndSave(DEFAULT_CONFIG);
  };

  const toggleAutostart = async () => {
    try {
      if (autostartOn) { await disable(); setAutostartOn(false); }
      else { await enable(); setAutostartOn(true); }
    } catch { /* ignore */ }
  };

  const a = cfg.animations[sel] || { x: 0, y: 0, w: 64, h: 64, framesX: 1, framesY: 1 };

  return (
    <div className="cp">
      <header className="cp-header">
        <AnimPreview cfg={cfg} animKey="idle" box={56} />
        <div>
          <h1>Desktop Pet</h1>
          <p className="cp-sub">Control Panel</p>
        </div>
      </header>

      {/* ---- Sprite sheet + slicer ---- */}
      <section className="cp-card">
        <h2>Sprite sheet</h2>
        <label className="cp-file">
          <input type="file" accept="image/png,image/*" onChange={onSpriteFile} />
          <span>Upload sprite sheet…</span>
        </label>

        <h2 className="cp-mt">Frame slicer</h2>
        <p className="cp-hint">
          Pick an animation, then <b>drag a box</b> over its first frame on the sheet.
          The boxes to the right are the following frames — line them up with the
          character. Fine-tune with the numbers below.
        </p>

        <div className="cp-anim-tabs">
          {ANIM_KEYS.map((k) => (
            <button
              key={k}
              className={"cp-tab" + (sel === k ? " active" : "")}
              onClick={() => setSel(k)}
            >
              {k}
            </button>
          ))}
        </div>

        <Slicer
          spriteSheet={cfg.spriteSheet}
          anim={a}
          onChange={(patch) => updateAnim(sel, patch)}
          onCommit={() => applyAndSave({ ...cfg })}
        />

        <div className="cp-grid6">
          <NumField label="X" value={a.x} onChange={(v) => updateAnim(sel, { x: v })} />
          <NumField label="Y" value={a.y} onChange={(v) => updateAnim(sel, { y: v })} />
          <NumField label="W" value={a.w} min={1} onChange={(v) => updateAnim(sel, { w: v })} />
          <NumField label="H" value={a.h} min={1} onChange={(v) => updateAnim(sel, { h: v })} />
          <NumField label="Frames X" value={a.framesX || a.frames || 1} min={1} onChange={(v) => updateAnim(sel, { framesX: v })} />
          <NumField label="Frames Y" value={a.framesY || 1} min={1} onChange={(v) => updateAnim(sel, { framesY: v })} />
        </div>

        <div className="cp-slice-preview">
          <span className="cp-hint">Preview ({sel}):</span>
          <AnimPreview cfg={cfg} animKey={sel} box={72} />
        </div>
      </section>

      {/* ---- Timing ---- */}
      <section className="cp-card">
        <h2>Timing</h2>
        <div className="cp-grid2">
          <NumField
            label="Frames per second"
            value={cfg.fps}
            min={1}
            max={60}
            onChange={(v) => update({ fps: Math.min(60, Math.max(1, v)) })}
          />
        </div>
      </section>

      {/* ---- Position ---- */}
      <section className="cp-card">
        <h2>Position</h2>
        <div className="cp-grid2">
          <NumField label="X (px)" value={pos.x} onChange={(v) => setPos((p) => ({ ...p, x: v }))} />
          <NumField label="Y (px)" value={pos.y} onChange={(v) => setPos((p) => ({ ...p, y: v }))} />
        </div>
        <div className="cp-row-btns">
          <button onClick={() => invoke("set_pet_position", { x: pos.x, y: pos.y })}>Move pet here</button>
          <button onClick={() => invoke("center_pet")}>Center on screen</button>
          <button className="cp-ghost" onClick={() => invoke("get_pet_position").then(([x, y]) => setPos({ x, y })).catch(() => {})}>
            Read current
          </button>
        </div>
      </section>

      {/* ---- Pet ---- */}
      <section className="cp-card">
        <h2>Pet</h2>
        <label className="cp-field cp-slider">
          <span>Pet size <b>{cfg.petSize ?? 128}px</b></span>
          <input
            type="range" min="64" max="512" step="8"
            value={cfg.petSize ?? 128}
            onChange={(e) => { const s = Number(e.target.value); setCfg((c) => ({ ...c, petSize: s })); emit("pet://size", s); }}
            onPointerUp={() => applyAndSave({ ...cfg })}
          />
        </label>
        <div className="cp-row-btns">
          <button onClick={() => invoke("show_pet")}>Show pet</button>
          <button onClick={() => invoke("hide_pet")}>Hide pet</button>
        </div>
        <label className="cp-check">
          <input
            type="checkbox"
            checked={cfg.clickThrough ?? true}
            onChange={(e) => { const next = { ...cfg, clickThrough: e.target.checked }; setCfg(next); applyAndSave(next); }}
          />
          Click through transparent pixels
        </label>
        <label className="cp-check">
          <input type="checkbox" checked={autostartOn} onChange={toggleAutostart} />
          Launch at login
        </label>
      </section>

      <footer className="cp-footer">
        <span className="cp-status">{status}</span>
        <div className="cp-row-btns">
          <button className="cp-ghost" onClick={resetDefaults}>Reset</button>
          <button className="cp-primary" onClick={() => applyAndSave()}>Save &amp; apply</button>
          <button className="cp-danger" onClick={() => invoke("quit_app")}>Quit app</button>
        </div>
      </footer>
    </div>
  );
}

// Visual slicer: shows the sheet with the selected animation's frame boxes,
// and lets the user drag a box to define frame 0 (x,y,w,h).
function Slicer({ spriteSheet, anim, onChange, onCommit }) {
  const stageRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const draw = useRef(null);
  const imgRef = useRef(null);

  const toImg = (e, isDown = false) => {
    const r = stageRef.current.getBoundingClientRect();
    const img = imgRef.current;
    
    if (isDown) {
      console.log("--------------------------------------------------");
      console.log("Mouse");
      console.log(`clientX: ${e.clientX}`);
      console.log(`clientY: ${e.clientY}`);
      console.log(`pageX: ${e.pageX}`);
      console.log(`pageY: ${e.pageY}`);
      console.log(`screenX: ${e.screenX}`);
      console.log(`screenY: ${e.screenY}`);
      console.log(`offsetX: ${e.nativeEvent.offsetX}`);
      console.log(`offsetY: ${e.nativeEvent.offsetY}`);
      
      console.log("--------------------------------------------------");
      console.log("Image");
      console.log(`naturalWidth: ${img?.naturalWidth}`);
      console.log(`naturalHeight: ${img?.naturalHeight}`);
      console.log(`width: ${img?.width}`);
      console.log(`height: ${img?.height}`);
      console.log(`clientWidth: ${img?.clientWidth}`);
      console.log(`clientHeight: ${img?.clientHeight}`);
      console.log(`offsetWidth: ${img?.offsetWidth}`);
      console.log(`offsetHeight: ${img?.offsetHeight}`);
      console.log(`scrollWidth: ${img?.scrollWidth}`);
      console.log(`scrollHeight: ${img?.scrollHeight}`);
      console.log(`stage getBoundingClientRect:`, r);
      console.log(`devicePixelRatio: ${window.devicePixelRatio}`);
    }

    const x = Math.round(((e.clientX - r.left) / r.width) * dims.w);
    const y = Math.round(((e.clientY - r.top) / r.height) * dims.h);
    
    if (isDown) {
      console.log(`convertedX: ${x}, convertedY: ${y}`);
    }
    return { x, y, rawX: e.clientX, rawY: e.clientY };
  };

  const onDown = (e) => {
    if (!dims.w) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    console.log("--------------------------------------------------");
    console.log("Selection dragStart");
    draw.current = toImg(e, true);
  };
  const onMove = (e) => {
    if (!draw.current) return;
    const p = toImg(e, false);
    const x = Math.min(draw.current.x, p.x);
    const y = Math.min(draw.current.y, p.y);
    const w = Math.abs(p.x - draw.current.x);
    const h = Math.abs(p.y - draw.current.y);
    if (w > 3 && h > 3) {
      onChange({ x, y, w, h });
    }
  };
  const onUp = (e) => {
    if (draw.current) {
      const p = toImg(e, false);
      const w = Math.abs(p.x - draw.current.x);
      const h = Math.abs(p.y - draw.current.y);
      console.log("--------------------------------------------------");
      console.log("Selection dragEnd");
      console.log(`rawWidth: ${Math.abs(p.rawX - draw.current.rawX)}`);
      console.log(`rawHeight: ${Math.abs(p.rawY - draw.current.rawY)}`);
      console.log(`convertedWidth: ${w}`);
      console.log(`convertedHeight: ${h}`);
      console.log(`savedX: ${anim.x}, savedY: ${anim.y}, savedW: ${anim.w}, savedH: ${anim.h}`);
      
      draw.current = null;
      onCommit();
    }
  };

  return (
    <div
      className="slicer-stage"
      ref={stageRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <img
        ref={imgRef}
        src={spriteSheet}
        alt="sheet"
        draggable={false}
        onLoad={(e) => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
      />
      {dims.w > 0 && (
        <svg className="slicer-overlay" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none">
          {Array.from({ length: Math.max(1, anim.framesY || 1) }).map((_, r) =>
            Array.from({ length: Math.max(1, anim.framesX || anim.frames || 1) }).map((_, c) => (
              <rect
                key={`${r}-${c}`}
                x={anim.x + c * anim.w}
                y={anim.y + r * anim.h}
                width={anim.w}
                height={anim.h}
                className={r === 0 && c === 0 ? "frame0" : "frameN"}
                vectorEffect="non-scaling-stroke"
              />
            ))
          )}
        </svg>
      )}
    </div>
  );
}

// Plays one animation's frames in a small box.
function AnimPreview({ cfg, animKey, box = 64 }) {
  const [frame, setFrame] = useState(0);
  const a = cfg.animations?.[animKey] ?? { x: 0, y: 0, w: 64, h: 64, framesX: 1, framesY: 1 };
  const totalFrames = (a.framesX || a.frames || 1) * (a.framesY || 1);
  useAnimationFrame(() => setFrame((f) => (f + 1) % Math.max(1, totalFrames)), cfg.fps);
  const scale = Math.min(box / a.w, box / a.h);
  return (
    <div className="cp-preview" style={{ width: box, height: box }}>
      <Sprite spriteSheet={cfg.spriteSheet} x={a.x} y={a.y} w={a.w} h={a.h} frame={frame % totalFrames} framesX={a.framesX} scale={scale} />
    </div>
  );
}

function NumField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <label className="cp-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
