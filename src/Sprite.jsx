// Renders one frame of the sprite sheet using CSS background-position stepping.
// A frame is defined by a rectangle: (x, y) top-left of frame 0, w x h size,
// stepping right by w for each subsequent frame index.

export default function Sprite({ spriteSheet, x, y, w, h, frame, scale = 1, flip = false }) {
  return (
    <div
      className="sprite"
      style={{
        width: `${w}px`,
        height: `${h}px`,
        backgroundImage: `url(${spriteSheet})`,
        backgroundRepeat: "no-repeat",
        // Offset to the current frame's top-left on the sheet.
        backgroundPosition: `-${x + frame * w}px -${y}px`,
        transform: `scale(${flip ? -scale : scale}, ${scale})`,
        transformOrigin: "center",
        imageRendering: "pixelated",
      }}
    />
  );
}
