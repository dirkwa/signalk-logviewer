# Signal K Log Viewer (WASM)

A WebAssembly-powered log viewer plugin for SignalK Server. View and filter server logs with grep-like functionality, all running in a secure WASM sandbox.

## Why WASM?

✅ **Security**: Sandboxed execution with no access to host system
✅ **Hot-reload**: Update plugin without server restart
✅ **Performance**: Node.js handles log streaming (no WASM memory limits)
✅ **Small binaries**: ~18 KB WASM binary
✅ **Crash isolation**: Plugin crashes don't affect server

## Architecture

The plugin uses a **hybrid approach** to overcome WASM memory buffer limitations (~64KB):

- **WASM Plugin**: Registers the HTTP endpoint and provides configuration UI
- **Node.js Handler**: Intercepts `/api/logs` requests and streams journalctl output directly
- **Result**: Can handle 2,000-50,000 log lines without freezing or memory issues

This architecture follows best practices: Node.js handles I/O-heavy operations while WASM provides the plugin interface.

## Requirements

- SignalK Server 3.0 or higher (with WASM support)
- Systemd logging (journalctl) or file-based logs
- Node.js >= 20 (for building)

## Features

- Get up to 50,000 last lines from log (default 2,000)
- Real-time filtering with grep-like search
- Copy logs to clipboard
- **Live Mode**: Auto-refresh like `tail -f`
- Timestamp format options:
  - **Original**: Shows timestamps as they appear in the log file
  - **ISO 8601**: Standard ISO format
  - **Locale**: Converts to your browser's local time format
- Resizable split-pane layout (75%/25% default)
- Interactive client-side filtering

## Installation

### From NPM (Recommended)

```bash
npm install signalk-logviewer
```

### From Source

```bash
# Clone repository
git clone https://github.com/dirkwa/signalk-logviewer.git
cd signalk-logviewer

# Install dependencies
npm install

# Build WASM plugin
npm run build

# Install to SignalK
mkdir -p ~/.signalk/node_modules/signalk-logviewer
cp plugin.wasm package.json ~/.signalk/node_modules/signalk-logviewer/
cp -r public ~/.signalk/node_modules/signalk-logviewer/
```

## Building from Source

### Prerequisites

```bash
npm install
```

### Build Commands

```bash
# Build release (optimized)
npm run build

# Build with maximum optimization
npm run build:optimized

# Build debug version (with source maps)
npm run asbuild:debug
```

### Build Output

- **Release**: `plugin.wasm` (~5-10 KB)
- **Debug**: `build/plugin.debug.wasm` (larger, with symbols)

## Configuration

Enable the plugin in SignalK Admin UI:

1. Navigate to **Server** → **Plugin Config**
2. Find "Log Viewer (WASM)"
3. Click **Enable**
4. Configure settings:
   - **Max Lines**: Maximum lines to retrieve (100-50,000)
   - **Log Source**: journalctl or file
   - **Log File Path**: Path if using file source
5. Click **Submit**

## Usage

### Access the Web Interface

Navigate to: `http://localhost:3000/plugins/signalk-logviewer/`

### Features

1. **Load Logs**: Click to fetch latest logs
2. **Filter**: Type to search (filters as you type)
3. **Live Mode**: Enable for real-time updates (like `tail -f`)
4. **Timestamp Format**: Choose Original, ISO 8601, or Locale
5. **Resize Panels**: Drag the handle between panels to adjust layout
6. **Copy**: Click to copy visible logs to clipboard

## Development

### Project Structure

```
signalk-logviewer/
├── assembly/
│   ├── index.ts          # Main WASM plugin implementation
│   └── tsconfig.json     # TypeScript config
├── public/
│   ├── index.html        # Web interface
│   └── images/
│       └── logviewer.png # Plugin icon
├── asconfig.json         # AssemblyScript build config
├── package.json          # NPM package metadata
└── plugin.wasm           # Compiled WASM binary
```

### Hot Reload

WASM plugins support hot-reload:

1. Make changes to `assembly/index.ts`
2. Run `npm run build`
3. In SignalK Admin: **Server** → **Plugin Config** → Click **Reload**

No server restart required!

### API Endpoints

The plugin registers:

- `GET /plugins/signalk-logviewer/api/logs?lines=N` - Fetch logs

Request:
```
GET /plugins/signalk-logviewer/api/logs?lines=100
```

Response:
```json
{
  "lines": [
    "2025-12-01T19:45:23+0000 pi5 signalk[1234]: signalk-server running at 0.0.0.0 port 3000"
  ],
  "count": 1,
  "source": "journalctl",
  "format": "short-iso"
}
```

## Capabilities

This plugin declares the following WASM capabilities:

| Capability | Enabled | Purpose |
|------------|---------|---------|
| `httpEndpoints` | ✅ | Register `/api/logs` endpoint |
| `staticFiles` | ✅ | Serve web interface from `public/` |
| `dataRead` | ✅ | Read Signal K data (future use) |
| `storage` | ✅ | VFS for configuration |
| `dataWrite` | ❌ | Not needed |
| `network` | ❌ | Not needed |
| `serialPorts` | ❌ | Not needed |

## Security

### Node.js Handler

The plugin uses a **Node.js handler** (not WASM) to stream logs, which executes:

- `journalctl -u signalk -n <N> --output=short-iso --no-pager` - Read SignalK service logs
- `tail -n <N> /var/log/syslog` - Fallback for file-based logs

The WASM plugin itself has no command execution capabilities - all I/O is handled by the trusted Node.js server process.

### Sandboxed Execution

- No access to host filesystem (except VFS)
- No network access
- No system command execution (except whitelisted)
- Isolated crash domain

## Troubleshooting

### Plugin doesn't load

Check `wasmManifest` path in package.json:
```json
"wasmManifest": "plugin.wasm"
```

### No logs shown

1. Check if journalctl works: `journalctl -u signalk -n 10`
2. Try file-based logs in plugin config
3. Check server logs for errors

### Build fails

```bash
# Clean and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Changelog

[View Changelog](CHANGELOG.md)

## Bug Reports

[GitHub Issues](https://github.com/dirkwa/signalk-logviewer/issues)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## License

MIT License - see LICENSE.md

## Credits

- Built with [AssemblyScript](https://www.assemblyscript.org/)
- Powered by [SignalK Server WASM Runtime](https://signalk.org/)
- Icon and design by Dirk Wahrheit
