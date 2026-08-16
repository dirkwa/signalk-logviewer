# Signal K Log Viewer

The motivation for this simple Webapp log viewer is that Sever -> Server Log is often cluttered and not searchable. Acts like "tail -n xxxx" and you can "grep" in the output. Victron VenusOS see below.

## Requirements
- SignalK 2.15 or higher
- Systemd logging or Victron Cerbo GX (tested v3.66 and v3.70-beta)

## Features
- Get up to 50000 last lines from log, 2000 lines by default
- Filter log
- Copy to clipboard
- Timestamp format options:
  - **Original**: Shows timestamps as they appear in the log file (default for TAI64N on Cerbo)
  - **ISO 8601**: Converts TAI64N timestamps to ISO 8601 format (e.g., 2025-01-15T10:30:45.123Z)
  - **Locale**: Converts timestamps to your browser's local time format
- Cerbo GX permission warning: Automatic detection and guidance for Venus OS users

## Development

```bash
npm install
npm run build        # compile TypeScript
npm run lint         # check for lint errors
npm run format       # run prettier + eslint --fix
npm test             # run tests
```

## Victron Venus OS (Cerbo GX / Octo GX / Venus GX)
- [Issue #1](https://github.com/victronenergy/venus/issues/1562) The log directory `/data/log/signalk-server` is owned by root:root, but the plugin runs as signalk:signalk, so it needs permission to access the log files. 
- [Issue #2](https://github.com/victronenergy/venus/issues/1563) Also the 25kb limit for the log file are way too small. 
- The following has been successfully tested on VenusOS 3.66:

### Quick Fix (temporary - resets on reboot)
1. SSH into your device as root
2. Execute:
```bash
chown -R signalk:signalk /data/log/signalk-server
```

### Persistent Solution (survives reboot)
1. SSH into your device as root
2. Create `/data/rc.local` file:
```bash
cat > /data/rc.local << 'EOF'
#!/bin/sh
# Fix SignalK log permissions
chown -R signalk:signalk /data/log/signalk-server
EOF
```
3. Make it executable:
```bash
chmod +x /data/rc.local
```
4. Reboot your device:
```bash
reboot
```
### Increase LOG size, default is only 25kb
1. SSH into your device as root
2. Backup original file 
```bash
cp /opt/victronenergy/service/signalk-server/log/run /data/run.backup
```
3. Edit `/opt/victronenergy/service/signalk-server/log/run` file:
```bash
cat > /opt/victronenergy/service/signalk-server/log/run << 'EOF'
#!/bin/sh
exec 2>&1
exec multilog t s2500000 n4 /var/log/signalk-server
EOF
```
4. Reboot your device:
```bash
reboot
```

**Note:** The plugin automatically detects Venus OS devices (Cerbo GX, Octo GX, Venus GX) and displays an error message with these instructions if logs cannot be accessed.

## Changelog
[Changelog at Github master](https://github.com/dirkwa/signalk-logviewer/blob/main/CHANGELOG.md)

## Bug reports
[GitHub Issues](https://github.com/dirkwa/signalk-logviewer/issues)

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

signalk-logviewer 1.0.0 and later is **source available, not open source**.
See [LICENSE.md](LICENSE.md).

**You may**, free of charge: run it on your own boat or fleet, private or
commercial; use it for internal company operations; modify it for your own use;
use it in education and research; and provide professional services around it.

**You may not**: redistribute it, or publish a modified version of it to npm or
anywhere else. Verbatim copies of official releases may be mirrored and cached.

Versions 0.4.0 and earlier remain available under the MIT license, see
[LICENSE-MIT-through-v0.x.txt](LICENSE-MIT-through-v0.x.txt).
