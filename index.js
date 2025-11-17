const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = function(app) {
  let plugin = {};
  let unsubscribes = [];
  let logBuffer = [];
  const MAX_BUFFER_SIZE = 10000;

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
        // Try journalctl first (most common for systemd installations)
        let lines = getLogsFromJournalctl(maxLines);
        let source = 'journalctl';
        let logPath = 'journalctl -u signalk';
        
        // If journalctl fails, try log files
        if (!lines) {
          const fileResult = getLogsFromFile(maxLines);
          if (fileResult) {
            lines = fileResult.lines;
            logPath = fileResult.path;
            source = 'file';
          }
        }
        
        // If still no logs, return error
        if (!lines || lines.length === 0) {
          return res.status(404).json({ 
            error: 'Could not find logs',
            message: 'Tried journalctl and common log file locations',
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