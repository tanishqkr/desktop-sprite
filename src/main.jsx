import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

// One bundle serves both windows. Tag <html> so window-specific CSS (the pet's
// transparent background vs. the control panel's opaque theme) applies to the
// right window even though all CSS is bundled together.
let isControl = true;
try {
  isControl = getCurrentWindow()?.label === "control";
} catch (e) {
  console.warn("Not running in Tauri; defaulting to control panel view.");
}

document.documentElement.dataset.view = isControl ? "control" : "pet";
const root = ReactDOM.createRoot(document.getElementById("root"));

(isControl ? import("./ControlPanel") : import("./App")).then(({ default: View }) => {
  root.render(<View />);
});
