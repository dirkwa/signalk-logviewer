const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = function(app) {
  let plugin = {};
  let unsubscribes = [];

  plugin.id = 'signalk-logviewer';
  plugin.name = 'Log Viewer';
  plugin.description = 'View and filter SignalK server logs';

  plugin.schema = {
    type: 'object',
    properties: {
      maxLines: {
        type: 'number',
        title: 'Maximum lines to retrieve',
        default: 2000,
        minimum: 100,
        maximum: 50000
      }
    }
  };

  plugin.start = function(options) {
    app.debug('Plugin started');
    
    // Function to convert TAI64N timestamp to readable format
    function convertTAI64N(tai64nStr) {
      try {
        // Remove @ prefix
        const hex = tai64nStr.substring(1);
        
        // Parse the hex string (first 16 chars are seconds since epoch + TAI offset)
        const hexSeconds = hex.substring(0, 16);
        const seconds = parseInt(hexSeconds, 16);
        
        // TAI64N starts at 1970-01-01 00:00:10 TAI (10 seconds offset)
        // Convert to Unix timestamp (subtract the TAI offset: 2^62 + 10)
        const TAI_OFFSET = Math.pow(2, 62) + 10;
        const unixSeconds = seconds - TAI_OFFSET;
        
        // Create date object
        const date = new Date(unixSeconds * 1000);
        return date.toISOString();
      } catch (err) {
        return tai64nStr; // Return original if conversion fails
      }
    }
    
    // Function to extract original timestamp and message
    function processLogLine(line) {
      // Check if line starts with @4 (TAI64N format)
      if (line.startsWith('@4')) {
        const parts = line.split(' ');
        if (parts.length > 0) {
          return {
            original: line,
            timestamp: parts[0],
            message: parts.slice(1).join(' ')
          };
        }
      }
      return {
        original: line,
        timestamp: null,
        message: line
      };
    }
    
    // Try to get logs from Victron Cerbo (Venus OS)
    function getLogsFromVictronCerbo(numLines) {
      const venusLogPath = '/data/log/signalk-server/current';

      try {
        app.debug('Attempting to read Victron Cerbo log at:', venusLogPath);

        // Try to check file accessibility
        fs.accessSync(venusLogPath, fs.constants.R_OK);
        app.debug('Found Victron Cerbo log at:', venusLogPath);

        // Read file and get last N lines
        const stats = fs.statSync(venusLogPath);
        const fileSize = stats.size;
        app.debug('Victron log file size:', fileSize, 'bytes');

        // Read last chunk of file (should be enough for numLines)
        const chunkSize = Math.min(500 * numLines, fileSize); // ~500 bytes per line estimate
        const buffer = Buffer.alloc(chunkSize);
        const fd = fs.openSync(venusLogPath, 'r');
        const startPos = Math.max(0, fileSize - chunkSize);

        app.debug('Reading', chunkSize, 'bytes from position', startPos);

        fs.readSync(fd, buffer, 0, chunkSize, startPos);
        fs.closeSync(fd);

        const data = buffer.toString('utf8');
        const allLines = data.split('\n').filter(line => line.trim());
        const lastLines = allLines.slice(-numLines);

        app.debug('Found', allLines.length, 'total lines, returning last', lastLines.length);

        // Process TAI64N timestamps - keep structured data
        const processedLines = lastLines.map(processLogLine);

        app.debug('Successfully read', processedLines.length, 'lines from Victron Cerbo');

        return {
          lines: processedLines,
          path: venusLogPath,
          source: 'victron-cerbo',
          hasTAI64N: true
        };
      } catch (err) {
        app.debug('Victron Cerbo log not accessible:', err.message);
        return null;
      }
    }
    
    // Try to get logs from journalctl if running as systemd service
    function getLogsFromJournalctl(numLines) {
      try {
        const output = execSync(`journalctl -u signalk -n ${numLines} --no-pager --output=cat`, {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        const lines = output.trim().split('\n');
        return lines.map(line => ({
          original: line,
          timestamp: null,
          message: line
        }));
      } catch (err) {
        app.debug('journalctl not available:', err.message);
        return null;
      }
    }
    
    // Try to get logs from file
    function getLogsFromFile(numLines) {
      try {
        // Check common log file locations
        const homeDir = require('os').homedir();
        const possiblePaths = [
          path.join(homeDir, '.signalk', 'logs', 'signalk-server.log'),
          path.join(homeDir, '.signalk', 'signalk-server.log'),
          '/var/log/signalk/signalk-server.log',
          '/var/log/signalk.log'
        ];
        
        for (const logPath of possiblePaths) {
          if (fs.existsSync(logPath)) {
            app.debug('Found log file at:', logPath);
            const data = fs.readFileSync(logPath, 'utf8');
            const lines = data.trim().split('\n').slice(-numLines);
            return {
              lines: lines.map(line => ({
                original: line,
                timestamp: null,
                message: line
              })),
              path: logPath
            };
          }
        }
        
        return null;
      } catch (err) {
        app.debug('Error reading log file:', err.message);
        return null;
      }
    }
    
    // Check if we're running on Victron Venus OS (Cerbo/Octo/etc)
    function isCerboSystem() {
      try {
        // Method 1: Check for Venus OS device hostnames + /data directory
        const hostname = require('os').hostname();
        app.debug('Hostname:', hostname);

        // Venus OS devices have specific hostnames:
        // - einstein = Cerbo GX
        // - beaglebone = Octo GX
        // - venus = Venus GX
        const venusHostnames = ['einstein', 'beaglebone', 'venus'];

        if (venusHostnames.includes(hostname) && fs.existsSync('/data')) {
          app.debug(`Detected Venus OS device (hostname: ${hostname})`);
          return true;
        }

        // Method 2: Check /etc/venus-release (if it exists on Venus OS)
        if (fs.existsSync('/etc/venus-release')) {
          app.debug('Detected Venus OS (/etc/venus-release exists)');
          return true;
        }

        // Method 3: Check /etc/version (Venus OS has this file)
        if (fs.existsSync('/etc/version') && fs.existsSync('/data')) {
          try {
            const version = fs.readFileSync('/etc/version', 'utf8').trim();
            // Venus OS version format is typically a date like "20250915120900"
            if (version.length === 14 && /^\d+$/.test(version)) {
              app.debug('Detected Venus OS (/etc/version format + /data directory)');
              return true;
            }
          } catch (err) {
            app.debug('Could not read /etc/version:', err.message);
          }
        }

        // Method 4: Check /etc/os-release for Venus OS identifier
        if (fs.existsSync('/etc/os-release')) {
          try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            if (osRelease.includes('venus') || osRelease.includes('Venus')) {
              app.debug('Detected Venus OS (from /etc/os-release)');
              return true;
            }
          } catch (err) {
            app.debug('Could not read /etc/os-release:', err.message);
          }
        }

        app.debug('Not a Cerbo/Venus OS system');
        return false;
      } catch (err) {
        app.error('Error detecting Cerbo system:', err.message);
        return false;
      }
    }

    // Register API endpoint for logs
    app.get('/signalk-logviewer/api/logs', (req, res) => {
      const numLines = parseInt(req.query.lines) || options.maxLines || 2000;
      const maxLines = Math.min(numLines, 50000);
      let isCerbo = isCerboSystem();

      try {
        let result = null;

        // Try Victron Cerbo first (Venus OS)
        app.debug('Checking for Victron Cerbo logs...');
        result = getLogsFromVictronCerbo(maxLines);
        if (result) {
          app.debug('Returning Victron Cerbo logs');
          // If we successfully read from Cerbo path, it's definitely a Cerbo
          isCerbo = true;
          return res.json({
            lines: result.lines,
            path: result.path,
            count: result.lines.length,
            source: result.source,
            hasTAI64N: result.hasTAI64N,
            isCerbo: true
          });
        }

        // If getLogsFromVictronCerbo was attempted but failed, and we haven't detected Cerbo yet,
        // it might still be a Cerbo with permission issues. Check if the Cerbo log path exists
        // but just couldn't be read
        if (!isCerbo && fs.existsSync('/data/log/signalk-server')) {
          app.debug('Detected Cerbo system (log directory exists but not readable)');
          isCerbo = true;
        }
        
        // Try journalctl (most common for systemd installations)
        app.debug('Trying journalctl...');
        let lines = getLogsFromJournalctl(maxLines);
        let source = 'journalctl';
        let logPath = 'journalctl -u signalk';
        
        // If journalctl fails, try log files
        if (!lines) {
          app.debug('Trying log files...');
          const fileResult = getLogsFromFile(maxLines);
          if (fileResult) {
            lines = fileResult.lines;
            logPath = fileResult.path;
            source = 'file';
          }
        }
        
        // If still no logs, return error
        if (!lines || lines.length === 0) {
          app.error('Could not find logs anywhere');
          const errorMessage = isCerbo
            ? 'Victron Venus OS users (Cerbo GX / Octo GX / Venus GX)'
            : 'Could not find logs';
          const suggestion = isCerbo
            ? 'SSH as root to your device and execute:\nchown -R signalk:signalk /data/log/signalk-server\n\nFor persistent solution and increasing of log file (survives reboot):\n\nSee README.md of this plugin.'
            : 'Check that SignalK is logging and accessible';

          return res.status(404).json({
            error: errorMessage,
            message: 'Tried Victron Cerbo, journalctl and common log file locations',
            suggestion: suggestion,
            isCerbo: isCerbo
          });
        }
        
        res.json({
          lines: lines,
          path: logPath,
          count: lines.length,
          source: source,
          hasTAI64N: false,
          isCerbo: isCerbo
        });
        
      } catch (error) {
        app.error('Error reading logs:', error);
        res.status(500).json({ 
          error: error.message,
          details: 'Could not fetch logs'
        });
      }
    });
    
    // Serve the HTML file
    app.get('/plugins/signalk-logviewer/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
    
    app.setPluginStatus('Running - Access at /plugins/signalk-logviewer/');
  };

  plugin.stop = function() {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    app.debug('Plugin stopped');
  };

  return plugin;
};