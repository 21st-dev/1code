# Claude Binary Build Process

## How It Works

1Code packages the Claude Code CLI binary within the Electron app. Each platform and architecture requires its own binary.

## Correct Build Process

### For macOS (Universal Build)

When building for macOS, electron-builder creates separate builds for different architectures:
- `release/mac-arm64/1Code.app` - ARM64 (Apple Silicon) build
- `release/mac/1Code.app` - x64 (Intel) build

**IMPORTANT**: You must download binaries for ALL architectures before building:

```bash
# Download binaries for all platforms
bun run claude:download:all

# Build the app
bun run build
bun run package:mac
```

The build scripts automatically handle this:
- `bun run package:mac` - Downloads all binaries, then builds
- `bun run package:win` - Downloads all binaries, then builds
- `bun run package:linux` - Downloads all binaries, then builds
- `bun run release` - Full release process with all binaries

### For Development (Single Architecture)

If you're only developing locally and don't need multi-arch builds:

```bash
# Download only your current platform's binary
bun run claude:download

# Build for development
bun run build
bun run package
```

## Binary Locations

After running `claude:download:all`, binaries are stored in:

```
resources/bin/
├── darwin-arm64/claude    # macOS ARM64
├── darwin-x64/claude      # macOS Intel
├── linux-arm64/claude     # Linux ARM64
├── linux-x64/claude       # Linux x64
├── win32-x64/claude.exe   # Windows x64
└── VERSION                # Version info
```

electron-builder copies the correct binary to each build:
- ARM64 build uses `darwin-arm64/claude`
- Intel build uses `darwin-x64/claude`

## Validation

After packaging, the build automatically validates that:
1. Each architecture has its binary present
2. The binary is the correct architecture (not wrong arch copied)
3. The binary is executable
4. The binary size is reasonable (>1MB)

If validation fails, you'll see clear error messages telling you to run `claude:download:all`.

## Troubleshooting

### Error: "Claude Code native binary not found"

**Cause**: Binaries weren't downloaded before building.

**Solution**:
```bash
bun run claude:download:all
bun run build
bun run package:mac  # or package:win, package:linux
```

### Error: "Wrong architecture" in validation

**Cause**: You ran `claude:download` (single platform) but tried to build multi-arch.

**Solution**:
```bash
bun run claude:download:all  # Download ALL platforms
bun run build
bun run package:mac
```

### Verification

To manually verify binaries are correct:

```bash
# Check ARM64 build
file release/mac-arm64/1Code.app/Contents/Resources/bin/claude
# Should show: Mach-O 64-bit executable arm64

# Check Intel build
file release/mac/1Code.app/Contents/Resources/bin/claude
# Should show: Mach-O 64-bit executable x86_64
```

## Legacy Fix Script

The old `claude:fix-path` script is deprecated. It used to copy binaries between architectures as a workaround, but this is no longer needed with the proper build process.

If you have old builds with wrong binaries, just rebuild:

```bash
rm -rf release
bun run claude:download:all
bun run build
bun run package:mac
```
