import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { processLogLine, type LogLine } from './tai64n';

export interface CerboLogResult {
  lines: LogLine[];
  path: string;
  source: 'victron-cerbo';
  hasTAI64N: true;
}

export interface FileLogResult {
  lines: LogLine[];
  path: string;
}

export interface Logger {
  debug: (msg: string, ...args: unknown[]) => void;
  error: (msg: string) => void;
}

const VENUS_LOG_PATH = '/data/log/signalk-server/current';

export function getLogsFromVictronCerbo(
  numLines: number,
  logger: Logger
): CerboLogResult | null {
  try {
    logger.debug('Attempting to read Victron Cerbo log at:', VENUS_LOG_PATH);
    fs.accessSync(VENUS_LOG_PATH, fs.constants.R_OK);
    logger.debug('Found Victron Cerbo log at:', VENUS_LOG_PATH);

    const stats = fs.statSync(VENUS_LOG_PATH);
    const fileSize = stats.size;
    logger.debug('Victron log file size:', fileSize, 'bytes');

    const chunkSize = Math.min(500 * numLines, fileSize);
    const buffer = Buffer.alloc(chunkSize);
    const fd = fs.openSync(VENUS_LOG_PATH, 'r');
    const startPos = Math.max(0, fileSize - chunkSize);

    logger.debug('Reading', chunkSize, 'bytes from position', startPos);

    fs.readSync(fd, buffer, 0, chunkSize, startPos);
    fs.closeSync(fd);

    const data = buffer.toString('utf8');
    const allLines = data.split('\n').filter((line) => line.trim());
    const lastLines = allLines.slice(-numLines);

    logger.debug(
      'Found',
      allLines.length,
      'total lines, returning last',
      lastLines.length
    );

    const processedLines = lastLines.map(processLogLine);

    logger.debug(
      'Successfully read',
      processedLines.length,
      'lines from Victron Cerbo'
    );

    return {
      lines: processedLines,
      path: VENUS_LOG_PATH,
      source: 'victron-cerbo',
      hasTAI64N: true
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug('Victron Cerbo log not accessible:', message);
    return null;
  }
}

export function getLogsFromJournalctl(
  numLines: number,
  logger: Logger
): LogLine[] | null {
  try {
    const output = execSync(
      `journalctl -u signalk -n ${String(numLines)} --no-pager --output=short-iso`,
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      }
    );
    return output
      .trim()
      .split('\n')
      .map((line) => {
        const match = line.match(
          /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4})\s+\S+\s+\S+\s+(.*)/
        );
        if (match) {
          return {
            original: line,
            timestamp: match[1],
            message: match[2]
          };
        }
        return { original: line, timestamp: null, message: line };
      });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug('journalctl not available:', message);
    return null;
  }
}

export function getLogsFromFile(
  numLines: number,
  logger: Logger
): FileLogResult | null {
  try {
    const homeDir = os.homedir();
    const possiblePaths = [
      path.join(homeDir, '.signalk', 'logs', 'signalk-server.log'),
      path.join(homeDir, '.signalk', 'signalk-server.log'),
      '/var/log/signalk/signalk-server.log',
      '/var/log/signalk.log'
    ];

    for (const logPath of possiblePaths) {
      if (fs.existsSync(logPath)) {
        logger.debug('Found log file at:', logPath);
        const data = fs.readFileSync(logPath, 'utf8');
        const lines = data
          .trim()
          .split('\n')
          .slice(-numLines)
          .map((line) => ({
            original: line,
            timestamp: null,
            message: line
          }));
        return { lines, path: logPath };
      }
    }

    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug('Error reading log file:', message);
    return null;
  }
}

const VENUS_HOSTNAMES = ['einstein', 'beaglebone', 'venus'];

export function isCerboSystem(logger: Logger): boolean {
  try {
    const hostname = os.hostname();
    logger.debug('Hostname:', hostname);

    if (VENUS_HOSTNAMES.includes(hostname) && fs.existsSync('/data')) {
      logger.debug(`Detected Venus OS device (hostname: ${hostname})`);
      return true;
    }

    if (fs.existsSync('/etc/venus-release')) {
      logger.debug('Detected Venus OS (/etc/venus-release exists)');
      return true;
    }

    if (fs.existsSync('/etc/version') && fs.existsSync('/data')) {
      try {
        const version = fs.readFileSync('/etc/version', 'utf8').trim();
        if (version.length === 14 && /^\d+$/.test(version)) {
          logger.debug(
            'Detected Venus OS (/etc/version format + /data directory)'
          );
          return true;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.debug('Could not read /etc/version:', message);
      }
    }

    if (fs.existsSync('/etc/os-release')) {
      try {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        if (osRelease.includes('venus') || osRelease.includes('Venus')) {
          logger.debug('Detected Venus OS (from /etc/os-release)');
          return true;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.debug('Could not read /etc/os-release:', message);
      }
    }

    logger.debug('Not a Cerbo/Venus OS system');
    return false;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error detecting Cerbo system: ' + message);
    return false;
  }
}
