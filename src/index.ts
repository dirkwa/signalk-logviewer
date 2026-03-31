import fs from 'fs';
import type { IRouter, Request, Response } from 'express';
import type { Plugin, ServerAPI } from '@signalk/server-api';
import {
  getLogsFromVictronCerbo,
  getLogsFromJournalctl,
  getLogsFromFile,
  isCerboSystem
} from './log-sources';

interface PluginConfig {
  maxLines?: number;
}

const plugin: Plugin = {
  id: 'signalk-logviewer',
  name: 'Log Viewer',
  description: 'View and filter SignalK server logs',

  schema: {
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
  },

  start(_config: object, _restart: (newConfiguration: object) => void): void {
    // Route registration is handled by registerWithRouter
  },

  stop(): void {
    // Nothing to clean up
  },

  registerWithRouter(router: IRouter): void {
    // This is called once at plugin load time, not inside start().
    // We don't have access to config here, so we use a module-level ref.
    registerRoutes(router);
  }
};

let app: ServerAPI;
let pluginConfig: PluginConfig = {};

function registerRoutes(router: IRouter): void {
  router.get('/api/logs', (req: Request, res: Response) => {
    const linesParam = req.query.lines;
    const parsedLines =
      typeof linesParam === 'string' ? parseInt(linesParam, 10) : NaN;
    const numLines = Number.isNaN(parsedLines)
      ? (pluginConfig.maxLines ?? 2000)
      : parsedLines;
    const maxLines = Math.min(numLines, 50000);
    let isCerbo = isCerboSystem(app);

    try {
      app.debug('Checking for Victron Cerbo logs...');
      const cerboResult = getLogsFromVictronCerbo(maxLines, app);
      if (cerboResult) {
        app.debug('Returning Victron Cerbo logs');
        res.json({
          lines: cerboResult.lines,
          path: cerboResult.path,
          count: cerboResult.lines.length,
          source: cerboResult.source,
          hasTAI64N: cerboResult.hasTAI64N,
          isCerbo: true
        });
        return;
      }

      if (!isCerbo && fs.existsSync('/data/log/signalk-server')) {
        app.debug(
          'Detected Cerbo system (log directory exists but not readable)'
        );
        isCerbo = true;
      }

      app.debug('Trying journalctl...');
      let lines = getLogsFromJournalctl(maxLines, app);
      let source = 'journalctl';
      let logPath = 'journalctl -u signalk';

      if (!lines) {
        app.debug('Trying log files...');
        const fileResult = getLogsFromFile(maxLines, app);
        if (fileResult) {
          lines = fileResult.lines;
          logPath = fileResult.path;
          source = 'file';
        }
      }

      if (!lines || lines.length === 0) {
        app.error('Could not find logs anywhere');
        const errorMessage = isCerbo
          ? 'Victron Venus OS users (Cerbo GX / Octo GX / Venus GX)'
          : 'Could not find logs';
        const suggestion = isCerbo
          ? 'SSH as root to your device and execute:\nchown -R signalk:signalk /data/log/signalk-server\n\nFor persistent solution and increasing of log file (survives reboot):\n\nSee README.md of this plugin.'
          : 'Check that SignalK is logging and accessible';

        res.status(404).json({
          error: errorMessage,
          message:
            'Tried Victron Cerbo, journalctl and common log file locations',
          suggestion,
          isCerbo
        });
        return;
      }

      res.json({
        lines,
        path: logPath,
        count: lines.length,
        source,
        hasTAI64N: false,
        isCerbo
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      app.error('Error reading logs: ' + message);
      res.status(500).json({
        error: message,
        details: 'Could not fetch logs'
      });
    }
  });
}

module.exports = (serverApi: ServerAPI): Plugin => {
  app = serverApi;

  const originalStart = plugin.start.bind(plugin);
  plugin.start = (
    config: object,
    restart: (newConfiguration: object) => void
  ): void => {
    pluginConfig = config as PluginConfig;
    app.debug('Plugin started');
    app.setPluginStatus('Running - Access at /plugins/signalk-logviewer/');
    originalStart(config, restart);
  };

  const originalStop = plugin.stop.bind(plugin);
  plugin.stop = (): void => {
    pluginConfig = {};
    app.debug('Plugin stopped');
    void originalStop();
  };

  return plugin;
};
