export interface LogLine {
  original: string;
  timestamp: string | null;
  message: string;
}

const TAI_OFFSET = 2 ** 62 + 10;

export function convertTAI64N(tai64nStr: string): string {
  try {
    const hex = tai64nStr.substring(1);
    const hexSeconds = hex.substring(0, 16);
    const seconds = parseInt(hexSeconds, 16);
    const unixSeconds = seconds - TAI_OFFSET;
    const date = new Date(unixSeconds * 1000);
    return date.toISOString();
  } catch {
    return tai64nStr;
  }
}

export function processLogLine(line: string): LogLine {
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
