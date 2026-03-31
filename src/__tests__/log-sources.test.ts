import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from '../log-sources';

vi.mock('fs');
vi.mock('os');
vi.mock('child_process');

const fs = await import('fs');
const os = await import('os');
const { execSync } = await import('child_process');
const {
  getLogsFromVictronCerbo,
  getLogsFromJournalctl,
  getLogsFromFile,
  isCerboSystem
} = await import('../log-sources');

const mockLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn()
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('isCerboSystem', () => {
  it('detects Venus OS by hostname + /data directory', () => {
    vi.mocked(os.hostname).mockReturnValue('einstein');
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === '/data');

    expect(isCerboSystem(mockLogger)).toBe(true);
  });

  it('detects Venus OS by /etc/venus-release', () => {
    vi.mocked(os.hostname).mockReturnValue('myboat');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => String(p) === '/etc/venus-release'
    );

    expect(isCerboSystem(mockLogger)).toBe(true);
  });

  it('detects Venus OS by /etc/version format + /data', () => {
    vi.mocked(os.hostname).mockReturnValue('myboat');
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      return path === '/etc/version' || path === '/data';
    });
    vi.mocked(fs.readFileSync).mockReturnValue('20250915120900');

    expect(isCerboSystem(mockLogger)).toBe(true);
  });

  it('detects Venus OS from /etc/os-release content', () => {
    vi.mocked(os.hostname).mockReturnValue('myboat');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => String(p) === '/etc/os-release'
    );
    vi.mocked(fs.readFileSync).mockReturnValue('ID=venus\nNAME="Venus OS"\n');

    expect(isCerboSystem(mockLogger)).toBe(true);
  });

  it('returns false when no Venus OS indicators found', () => {
    vi.mocked(os.hostname).mockReturnValue('mydesktop');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(isCerboSystem(mockLogger)).toBe(false);
  });

  it('returns false and logs error on unexpected exception', () => {
    vi.mocked(os.hostname).mockImplementation(() => {
      throw new Error('os failure');
    });

    expect(isCerboSystem(mockLogger)).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error detecting Cerbo system: os failure'
    );
  });
});

describe('getLogsFromJournalctl', () => {
  it('returns parsed log lines on success', () => {
    vi.mocked(execSync).mockReturnValue('line one\nline two\nline three\n');

    const result = getLogsFromJournalctl(100, mockLogger);
    expect(result).toEqual([
      { original: 'line one', timestamp: null, message: 'line one' },
      { original: 'line two', timestamp: null, message: 'line two' },
      { original: 'line three', timestamp: null, message: 'line three' }
    ]);
  });

  it('returns null when journalctl is not available', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('command not found');
    });

    expect(getLogsFromJournalctl(100, mockLogger)).toBeNull();
  });
});

describe('getLogsFromFile', () => {
  it('reads from the first existing log file', () => {
    vi.mocked(os.homedir).mockReturnValue('/tmp/fakehome');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => String(p) === '/tmp/fakehome/.signalk/logs/signalk-server.log'
    );
    vi.mocked(fs.readFileSync).mockReturnValue('log line 1\nlog line 2');

    const result = getLogsFromFile(100, mockLogger);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(
      '/tmp/fakehome/.signalk/logs/signalk-server.log'
    );
    expect(result!.lines).toHaveLength(2);
  });

  it('returns null when no log files exist', () => {
    vi.mocked(os.homedir).mockReturnValue('/tmp/fakehome');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(getLogsFromFile(100, mockLogger)).toBeNull();
  });

  it('limits output to numLines', () => {
    vi.mocked(os.homedir).mockReturnValue('/tmp/fakehome');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => String(p) === '/tmp/fakehome/.signalk/logs/signalk-server.log'
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      'line1\nline2\nline3\nline4\nline5'
    );

    const result = getLogsFromFile(2, mockLogger);
    expect(result!.lines).toHaveLength(2);
    expect(result!.lines[0].message).toBe('line4');
    expect(result!.lines[1].message).toBe('line5');
  });
});

describe('getLogsFromVictronCerbo', () => {
  it('returns null when log file is not accessible', () => {
    vi.mocked(fs.accessSync).mockImplementation(() => {
      throw new Error('EACCES');
    });

    expect(getLogsFromVictronCerbo(100, mockLogger)).toBeNull();
  });

  it('reads and processes Cerbo log lines', () => {
    const logData =
      '@4000000067b5e38d1a5a4a6c first line\n@4000000067b5e38e2b6b5b7d second line\n';
    vi.mocked(fs.accessSync).mockReturnValue(undefined);
    vi.mocked(fs.statSync).mockReturnValue({
      size: logData.length
    } as fs.Stats);
    vi.mocked(fs.openSync).mockReturnValue(42);
    vi.mocked(fs.readSync).mockImplementation((_fd, buffer: Buffer) => {
      buffer.write(logData);
      return logData.length;
    });
    vi.mocked(fs.closeSync).mockReturnValue(undefined);

    const result = getLogsFromVictronCerbo(100, mockLogger);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('victron-cerbo');
    expect(result!.hasTAI64N).toBe(true);
    expect(result!.lines).toHaveLength(2);
    expect(result!.lines[0].timestamp).toBe('@4000000067b5e38d1a5a4a6c');
    expect(result!.lines[0].message).toBe('first line');
    expect(result!.lines[1].timestamp).toBe('@4000000067b5e38e2b6b5b7d');
    expect(result!.lines[1].message).toBe('second line');
  });
});
