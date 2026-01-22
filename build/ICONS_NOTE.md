# Build Assets Note

## Current Status

The icon files in this directory (icon.icns, icon.png, icon.ico, etc.) are currently using the original 1Code geometric logo design. This logo is a simple abstract geometric pattern that doesn't contain any "1Code" or "21st" text, so it can remain as a placeholder.

## Future Work

When Intelligence Interface branding is finalized, these files should be replaced with new icons:

### Files to Replace
- `icon.icns` - macOS app icon (309K)
- `icon.ico` - Windows app icon (not present, may need generation)
- `icon.png` - Generic icon (66K, 1024×1024)
- `trayTemplate.svg` - macOS menu bar icon (886B)
- `trayTemplate.png` - macOS menu bar icon (37K)
- `background.svg` - DMG background (11K)
- `background.tiff` / `background@2x.tiff` - DMG backgrounds
- `background@2x.png` - DMG background (269K)
- `dmg-background.svg` / `dmg-background.png` / `dmg-background@2x.png` - DMG visuals

### Icon Requirements

- **macOS (.icns)**: Multi-resolution icon set (16×16 to 1024×1024)
- **Windows (.ico)**: Multi-resolution (16×16, 32×32, 48×48, 256×256)
- **Linux (.png)**: Typically 512×512 or 1024×1024
- **Tray Icon**: Monochrome template (for light/dark menu bars)
- **DMG Background**: Customizable installer background

### Generation Tools

Use `bun run icon:generate` after replacing the source icon.png to regenerate all platform-specific formats.

## Branding Guidelines

Intelligence Interface icons should:
1. Be simple and recognizable at small sizes (16×16)
2. Work well in both light and dark themes
3. Avoid text (especially at small sizes)
4. Consider using "II" monogram or abstract representation
5. Maintain professional developer-tool aesthetic
