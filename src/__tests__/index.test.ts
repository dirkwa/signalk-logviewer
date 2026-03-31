import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plugin, ServerAPI } from '@signalk/server-api';

vi.mock('fs');
vi.mock('../log-sources', () => ({
  getLogsFromVictronCerbo: vi.fn().mockReturnValue(null),
  getLogsFromJournalctl: vi
    .fn()
    .mockReturnValue([
      { original: 'test line', timestamp: null, message: 'test line' }
    ]),
  getLogsFromFile: vi.fn().mockReturnValue(null),
  isCerboSystem: vi.fn().mockReturnValue(false)
}));

function createMockApp(): ServerAPI {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    setPluginStatus: vi.fn(),
    setPluginError: vi.fn()
  } as unknown as ServerAPI;
}

describe('plugin', () => {
  let plugin: Plugin;
  let mockApp: ServerAPI;

  beforeEach(async () => {
    vi.resetModules();
    mockApp = createMockApp();
    const factory = (await import('../index')) as {
      default: (app: ServerAPI) => Plugin;
    };
    plugin = factory.default(mockApp);
  });

  it('has correct id, name, and description', () => {
    expect(plugin.id).toBe('signalk-logviewer');
    expect(plugin.name).toBe('Log Viewer');
    expect(plugin.description).toBe('View and filter SignalK server logs');
  });

  it('has a valid schema', () => {
    expect(plugin.schema).toEqual({
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
    });
  });

  it('has registerWithRouter defined', () => {
    expect(plugin.registerWithRouter).toBeDefined();
  });

  it('registers /api/logs route via registerWithRouter', () => {
    const mockRouter = {
      get: vi.fn()
    };
    plugin.registerWithRouter!(mockRouter as never);
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/api/logs',
      expect.any(Function)
    );
  });

  it('start sets plugin status', () => {
    plugin.start({}, vi.fn());
    expect(mockApp.setPluginStatus).toHaveBeenCalledWith(
      'Running - Access at /plugins/signalk-logviewer/'
    );
  });

  it('stop calls debug', () => {
    plugin.start({}, vi.fn());
    plugin.stop();
    expect(mockApp.debug).toHaveBeenCalledWith('Plugin stopped');
  });

  it('api/logs handler returns logs via json response', () => {
    const mockRouter = { get: vi.fn() };
    plugin.registerWithRouter!(mockRouter as never);
    plugin.start({}, vi.fn());

    const handler = mockRouter.get.mock.calls[0][1] as (
      req: unknown,
      res: unknown
    ) => void;

    const req = { query: { lines: '100' } };
    const res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis()
    };

    handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 1,
        source: 'journalctl',
        hasTAI64N: false
      })
    );
  });
});
