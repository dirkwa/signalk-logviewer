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
        maximum: 10000
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
    
    // Function to process log line and convert TAI64N if present
    function processLogLine(line) {
      // Check if line starts with @4 (TAI64N format)
      if (line.startsWith('@4')) {
        const parts = line.split(' ');
        if (parts.length > 0) {
          const timestamp = convertTAI64N(parts[0]);
          return timestamp + ' ' + parts.slice(1).join(' ');
        }
      }
      return line;
    }
    
    // Try to get logs from Victron Cerbo (Venus OS)
    function getLogsFromVictronCerbo(numLines) {
      try {
        const venusLogPath = '/data/log/signalk-server/current';
        
        if (fs.existsSync(venusLogPath)) {
          app.debug('Found Victron Cerbo log at:', venusLogPath);
          
          // Check if file is readable
          try {
            fs.accessSync(venusLogPath, fs.constants.R_OK);
          } catch (err) {
            app.error('Cannot read Victron log file:', err.message);
            return null;
          }
          
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
          
          // Process TAI64N timestamps
          const processedLines = lastLines.map(processLogLine);
          
          app.debug('Successfully read', processedLines.length, 'lines from Victron Cerbo');
          
          return {
            lines: processedLines,
            path: venusLogPath,
            source: 'victron-cerbo'
          };
        }
        
        app.debug('Victron Cerbo log path does not exist:', venusLogPath);
        return null;
      } catch (err) {
        app.error('Error reading Victron Cerbo log:', err.message);
        app.error('Stack:', err.stack);
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
        return output.trim().split('\n');
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
            const lines = data.trim().split('\n');
            return {
              lines: lines.slice(-numLines),
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
    
    // Register API endpoint for logs
    app.get('/plugins/signalk-logviewer/api/logs', (req, res) => {
      const numLines = parseInt(req.query.lines) || options.maxLines || 2000;
      const maxLines = Math.min(numLines, 10000);
      
      try {
        let result = null;
        
        // Try Victron Cerbo first (Venus OS)
        app.debug('Checking for Victron Cerbo logs...');
        result = getLogsFromVictronCerbo(maxLines);
        if (result) {
          app.debug('Returning Victron Cerbo logs');
          return res.json({
            lines: result.lines,
            path: result.path,
            count: result.lines.length,
            source: result.source
          });
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
          return res.status(404).json({ 
            error: 'Could not find logs',
            message: 'Tried Victron Cerbo, journalctl and common log file locations',
            suggestion: 'Check that SignalK is logging and accessible'
          });
        }
        
        res.json({
          lines: lines,
          path: logPath,
          count: lines.length,
          source: source
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