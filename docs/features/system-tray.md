# System Tray

The app includes a persistent system tray icon that allows quick access to profiles and workspaces even when all windows are closed.

## Platform Support

- **macOS**: Menu bar icon (template image, adapts to light/dark mode)
- **Windows**: System tray icon (bottom-right)
- **Linux**: System tray icon (desktop environment dependent)

## Features

### Left Click
- Restores or creates the main window
- If windows are minimized, brings them to front
- If no windows exist, creates a new one

### Right Click Menu

```
├── Show 1Code (macOS only)
├── ─────────
├── Profiles ⊳
│   ├── ✓ Active Profile
│   └── Other Profiles
├── ─────────
├── Workspaces ⊳
│   └── Project List
├── ─────────
├── New Workspace...
├── Settings...
├── ─────────
└── Quit
```

### Profile Switching
- Click any profile to switch immediately
- All windows reload with new profile
- Active profile shown with checkmark

### Workspace Navigation
- Click workspace to open new chat with that workspace selected
- Creates window if needed
- Sets workspace and reloads

### Background Mode
- App continues running when all windows are closed
- Only way to quit is via tray menu or Cmd+Q
- Windows can be restored by clicking tray icon

## Implementation

### Files
- `src/main/lib/tray.ts` - Tray initialization and menu building
- `src/renderer/lib/tray-events.ts` - Renderer event listeners
- `resources/icons/tray-*.png` - Tray icon assets

### Menu Updates
Menu rebuilds when:
- Profiles are added/removed/switched
- Projects are added/removed
- App starts

## Troubleshooting

### Tray icon not appearing (macOS)
- Check System Settings → Control Center → Menu Bar Only
- Ensure "Show in Menu Bar" is enabled for the app

### Tray icon not appearing (Linux)
- Ensure desktop environment supports system tray
- Install system tray extensions if using GNOME
- Check if `libappindicator` is installed

### App won't quit
- Use tray menu → Quit
- Or press Cmd+Q from menu bar (macOS)
