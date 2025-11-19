# Signal K Log Viewer

The motivation for this simple Webapp log viewer is that Sever -> Server Log is often cluttered and not searchable. Acts like "tail -n xxxx" and you can "grep" in the output. Victron VenusOS see below.

## Requirements
- SignalK 2.15 or higher
- Systemd logging

## Features
- Get up to 10000 last lines from log, 2000 lines by default
- Filter log
- Copy to clipboard
- Timestamp format options:
  - **Original**: Shows timestamps as they appear in the log file (default for TAI64N on Cerbo)
  - **ISO 8601**: Converts TAI64N timestamps to ISO 8601 format (e.g., 2025-01-15T10:30:45.123Z)
  - **Locale**: Converts timestamps to your browser's local time format
- Cerbo GX permission warning: Automatic detection and guidance for Venus OS users

## Victron Venus OS (Cerbo GX / Octo GX / Venus GX)
The log directory `/data/log/signalk-server` is owned by root:root, but the plugin runs as signalk:signalk, so it needs permission to access the log files.

To make this plugin work on Venus OS devices:

1. SSH into your device as root
2. Execute:
```bash
chown -R signalk:signalk /data/log/signalk-server
```

**Note:** This change is not persistent and must be reapplied after every reboot. The plugin automatically detects Venus OS devices (Cerbo GX, Octo GX, Venus GX) and displays an error message with these instructions if logs cannot be accessed.

## Roadmap
- Support signalk-server inside docker
- Add Logo for Webapp
- Make Cerbo permission change persistent across reboots

## Bug reports
[GitHub Issues](https://github.com/dirkwa/signalk-logviewer/issues)

## Contributing
Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

#  License MIT
