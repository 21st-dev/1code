import { app, BrowserWindow } from "electron";

export function bringToFront(win?: BrowserWindow | null) {
  const w = win ?? BrowserWindow.getAllWindows().find(x => !x.isDestroyed());
  if (!w || w.isDestroyed()) return;

  // If you hide to tray / not visible, focus() alone won't show it
  if (!w.isVisible()) w.show();

  if (w.isMinimized()) w.restore();

  // Helps on macOS (activates the app)
  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }

  // Normal attempt
  w.focus();

  // Windows sometimes ignores focus; this "topmost blip" often works
  if (process.platform === "win32") {
    w.setAlwaysOnTop(true);
    setTimeout(() => w.setAlwaysOnTop(false), 200);
  }
}
