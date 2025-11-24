# Changelog

All notable changes to SignalK Log Viewer will be documented in this file.

## [0.3.1] - 2025-11-24
### Added
- Timestamp conversion support for journalctl logs
  - Automatically detects and parses ISO 8601, journalctl format (Nov 20 01:04:28), and other common timestamp formats
  - Converts to locale (browser time) or ISO 8601 format
  - Works with all log sources (journalctl, file-based logs, and Cerbo TAI64N)

### Fixed
- Timestamp dropdown now works for all log types, not just Cerbo logs

## [0.3.0] - 2025-11-24
### Added
- **Live Mode**: Real-time log monitoring with auto-refresh (tail -f behavior)
  - Toggle checkbox to enable/disable live updates
  - Polls for new logs every 2 seconds
  - Auto-scrolls to bottom (pauses if user scrolls up)
  - Applies active filter to new incoming lines
- **Interactive Client-Side Filtering**: Filter logs without reloading
  - Filters as you type with 300ms debounce
  - Instant results, no network requests
  - Works with live mode
- **Resizable Split-Pane Layout**: Adjustable log panels
  - Default 75%/25% split (top/bottom)
  - Drag the resize handle to adjust
  - Remembers your preference in localStorage
  - Minimum size constraints to prevent panels from becoming too small

### Changed
- Bottom panel now starts at 25% height instead of 50%
- Filter input is more responsive with real-time updates

## [0.2.2] - 2025-11-23
### Changed
- Updated README with reference to the issues of Cerbo GX

## [0.2.1] - 2025-11-23
### Changed
- Increased max lines to 50000 to debug high frequency delta's
- Updated README with pre-requirements of Cerbo GX

## [0.2.0] - 2025-11-22
### Added
- Plugin logo displayed in SignalK Webapps list

### Changed
- Updated README with backup step for Venus OS log configuration

## [0.1.4] - 2025-11-21
### Added
- Timestamp format dropdown with three options: Original, ISO 8601, Locale
- TAI64N timestamp conversion for Victron Venus OS logs
- Persistent solution for Venus OS log permissions using `/data/rc.local`
- Multi-method Venus OS detection (hostname, system files)
- Numbered list format for error messages with step-by-step instructions
- Documentation on increasing Venus OS log size from 25kb default

### Fixed
- Plugin API route registration (removed incorrect `/plugins/` prefix)
- Venus OS detection without requiring log file access permissions

### Changed
- Error messages now show both quick fix and persistent solution
- Improved Venus OS permission guidance in README

## [0.1.3] - 2025-11-21
### Changed
- Documentation improvements

## [0.1.2] - 2025-11-21
### Changed
- Documentation updates

## [0.1.1] - 2025-11-20
### Changed
- Documentation optimizations

## [0.1.0] - 2025-11-19
### Added
- Initial stable release
- Basic log viewing functionality
- Log filtering (grep-like)
- Support for journalctl and file-based logs

## [0.0.5] - 2025-11-19
### Changed
- Updated documentation

## [0.0.5-beta.1] - 2025-11-19
### Added
- Initial Cerbo permission issue detection

## [0.0.4] - 2025-11-18
### Added
- Copy to clipboard functionality
- Experimental Victron Cerbo detection

## [0.0.3] - 2025-11-18
### Added
- Initial public release
- View up to 10,000 log lines
- Text filtering
- Support for multiple log sources

## [0.0.2] - 2025-11-18
### Changed
- Internal improvements

## [0.0.1] - 2025-11-18
### Added
- Initial development version
