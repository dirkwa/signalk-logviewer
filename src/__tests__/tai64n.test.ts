import { describe, it, expect } from 'vitest';
import { convertTAI64N, processLogLine } from '../tai64n';

describe('convertTAI64N', () => {
  it('converts a known TAI64N timestamp to ISO string', () => {
    const result = convertTAI64N('@4000000067b5e38d1a5a4a6c');
    expect(result).toBe('2025-02-19T14:00:32.000Z');
  });

  it('converts another known TAI64N timestamp', () => {
    // Unix epoch 0 → @400000000000000a (2^62 + 10 in hex = 400000000000000a)
    const result = convertTAI64N('@400000000000000a0000000000000000');
    expect(result).toBe('1970-01-01T00:00:00.000Z');
  });

  it('returns original string on invalid input', () => {
    expect(convertTAI64N('not-a-timestamp')).toBe('not-a-timestamp');
  });

  it('returns original string on empty input', () => {
    expect(convertTAI64N('')).toBe('');
  });
});

describe('processLogLine', () => {
  it('extracts timestamp and message from TAI64N line', () => {
    const line = '@4000000067b5e38d1a5a4a6c some log message here';
    const result = processLogLine(line);
    expect(result).toEqual({
      original: line,
      timestamp: '@4000000067b5e38d1a5a4a6c',
      message: 'some log message here'
    });
  });

  it('handles TAI64N line with no message after timestamp', () => {
    const line = '@4000000067b5e38d1a5a4a6c';
    const result = processLogLine(line);
    expect(result).toEqual({
      original: line,
      timestamp: '@4000000067b5e38d1a5a4a6c',
      message: ''
    });
  });

  it('returns null timestamp for non-TAI64N line', () => {
    const line = '2025-01-15 10:30:45 some regular log';
    const result = processLogLine(line);
    expect(result).toEqual({
      original: line,
      timestamp: null,
      message: line
    });
  });

  it('returns null timestamp for empty line', () => {
    const result = processLogLine('');
    expect(result).toEqual({
      original: '',
      timestamp: null,
      message: ''
    });
  });

  it('handles TAI64N line with multiple spaces in message', () => {
    const line = '@4000000067b5e38d1a5a4a6c  extra  spaces  here';
    const result = processLogLine(line);
    expect(result).toEqual({
      original: line,
      timestamp: '@4000000067b5e38d1a5a4a6c',
      message: ' extra  spaces  here'
    });
  });
});
