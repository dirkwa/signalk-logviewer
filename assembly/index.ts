import {
  Plugin,
  setStatus,
  setError,
  debug
} from '../node_modules/@signalk/assemblyscript-plugin-sdk/assembly/index'

// FFI declaration for executing shell commands
@external("env", "sk_exec_command")
declare function sk_exec_command_ffi(
  cmdPtr: usize,
  cmdLen: usize,
  outPtr: usize,
  outMaxLen: usize
): i32

/**
 * Execute a shell command and return the output
 * @param command - Command to execute
 * @param maxOutput - Maximum output buffer size (default 1MB)
 * @returns Command output as string, or empty string if failed
 */
function execCommand(command: string, maxOutput: i32 = 1048576): string {
  const cmdBuffer = String.UTF8.encode(command)
  const outputBuffer = new ArrayBuffer(maxOutput)

  const bytesRead = sk_exec_command_ffi(
    changetype<usize>(cmdBuffer),
    cmdBuffer.byteLength,
    changetype<usize>(outputBuffer),
    maxOutput
  )

  if (bytesRead === 0) {
    return '' // Command failed or not allowed
  }

  return String.UTF8.decode(outputBuffer)
}

/**
 * Log line structure for parsing
 */
class LogLine {
  original: string
  timestamp: string | null
  message: string

  constructor(original: string, timestamp: string | null, message: string) {
    this.original = original
    this.timestamp = timestamp
    this.message = message
  }

  toJSON(): string {
    const ts = this.timestamp
    const timestampJson = ts !== null ? `"${ts}"` : 'null'

    // Fast inline escape - only handle critical JSON characters
    const parts: string[] = []
    parts.push('{"original":"')

    // Escape original
    for (let i = 0; i < this.original.length; i++) {
      const ch = this.original.charAt(i)
      if (ch == '"') parts.push('\\"')
      else if (ch == '\\') parts.push('\\\\')
      else if (ch == '\n') parts.push('\\n')
      else if (ch == '\r') parts.push('\\r')
      else parts.push(ch)
    }

    parts.push('","timestamp":')
    parts.push(timestampJson)
    parts.push(',"message":"')

    // Escape message
    for (let i = 0; i < this.message.length; i++) {
      const ch = this.message.charAt(i)
      if (ch == '"') parts.push('\\"')
      else if (ch == '\\') parts.push('\\\\')
      else if (ch == '\n') parts.push('\\n')
      else if (ch == '\r') parts.push('\\r')
      else parts.push(ch)
    }

    parts.push('"}')
    return parts.join('')
  }
}

/**
 * Escape all special characters for JSON (handles all control chars 0x00-0x1F)
 * Uses array batching: collects normal chars, flushes when special char found
 */
function escapeForJSON(str: string): string {
  const parts: string[] = []
  let batch = ''  // Accumulate normal characters

  for (let i = 0; i < str.length; i++) {
    const ch = str.charAt(i)
    const code = str.charCodeAt(i)

    // Handle special characters - flush batch and add escape sequence
    if (ch == '\\') {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      parts.push('\\\\')
    }
    else if (ch == '"') {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      parts.push('\\"')
    }
    else if (ch == '\n') {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      parts.push('\\n')
    }
    else if (ch == '\r') {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      parts.push('\\r')
    }
    else if (ch == '\t') {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      parts.push('\\t')
    }
    else if (ch == '\b') {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      parts.push('\\b')
    }
    else if (ch == '\f') {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      parts.push('\\f')
    }
    // Handle all other control characters (0x00-0x1F) as \uXXXX
    else if (code < 0x20) {
      if (batch.length > 0) { parts.push(batch); batch = '' }
      const hex = code.toString(16)
      parts.push('\\u' + '0000'.substring(0, 4 - hex.length) + hex)
    }
    else {
      // Normal character - add to batch
      batch += ch
    }
  }

  // Flush final batch
  if (batch.length > 0) parts.push(batch)

  return parts.join('')
}

/**
 * Parse a single log line from journalctl short-iso format
 * Format: 2025-11-24T04:34:59+0000 hostname service[pid]: message
 */
function processLogLine(line: string): LogLine {
  // Check for ISO timestamp at start (e.g., 2025-11-24T04:34:59+0000)
  if (line.length > 25 && line.charAt(4) == '-' && line.charAt(7) == '-' && line.charAt(10) == 'T') {
    // Find first space after timestamp (should be around position 25)
    let spaceIndex = -1
    for (let i = 19; i < 30 && i < line.length; i++) {
      if (line.charAt(i) == ' ') {
        spaceIndex = i
        break
      }
    }

    if (spaceIndex > 0) {
      const timestamp = line.substring(0, spaceIndex)
      const message = line.substring(spaceIndex + 1)
      return new LogLine(line, timestamp, message)
    }
  }

  // No structured timestamp found
  return new LogLine(line, null, line)
}

/**
 * Read logs from journalctl using short-iso format (much more compact than JSON!)
 */
function getLogsFromJournalctl(maxLines: i32): string[] {
  // Use --output=short-iso for compact, readable format with ISO timestamps
  // This is ~100x smaller than --output=json
  const command = `journalctl -u signalk -n ${maxLines.toString()} --output=short-iso --no-pager`
  const output = execCommand(command, 2097152) // 2MB buffer

  if (output.length == 0) {
    return []
  }

  return output.split('\n').filter(line => line.length > 0)
}

/**
 * Read logs from a file
 */
function getLogsFromFile(filePath: string, maxLines: i32): string[] {
  const command = `tail -n ${maxLines.toString()} ${filePath}`
  const output = execCommand(command, 2097152) // 2MB buffer

  if (output.length == 0) {
    return []
  }

  return output.split('\n').filter(line => line.length > 0)
}

/**
 * Main plugin class
 */
class LogViewerPlugin extends Plugin {
  id(): string {
    return 'signalk-logviewer'
  }

  name(): string {
    return 'Log Viewer (WASM)'
  }

  schema(): string {
    return `{
      "type": "object",
      "properties": {
        "maxLines": {
          "type": "number",
          "title": "Maximum lines to retrieve",
          "description": "Maximum number of log lines to retrieve (100-50000)",
          "default": 2000,
          "minimum": 100,
          "maximum": 50000
        },
        "logSource": {
          "type": "string",
          "title": "Log Source",
          "description": "Where to read logs from",
          "default": "journalctl",
          "enum": ["journalctl", "file"]
        },
        "logFilePath": {
          "type": "string",
          "title": "Log File Path",
          "description": "Path to log file (if using file source)",
          "default": "/var/log/syslog"
        }
      }
    }`
  }

  start(configJson: string): i32 {
    debug('Log Viewer WASM plugin starting')
    setStatus('Running')
    return 0 // Success
  }

  stop(): i32 {
    debug('Log Viewer WASM plugin stopping')
    setStatus('Stopped')
    return 0 // Success
  }
}

// Export plugin instance
const plugin = new LogViewerPlugin()

export function plugin_id(): string {
  return plugin.id()
}

export function plugin_name(): string {
  return plugin.name()
}

export function plugin_schema(): string {
  return plugin.schema()
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
  const configBytes = new Uint8Array(i32(configLen))
  for (let i: i32 = 0; i < i32(configLen); i++) {
    configBytes[i] = load<u8>(configPtr + <usize>i)
  }
  const configJson = String.UTF8.decode(configBytes.buffer)
  return plugin.start(configJson)
}

export function plugin_stop(): i32 {
  return plugin.stop()
}

/**
 * Register HTTP endpoints
 */
export function http_endpoints(): string {
  debug('http_endpoints() called - registering /api/logs endpoint')
  // Manually build JSON array string
  const endpoints = `[{"method":"GET","path":"/api/logs","handler":"handle_get_logs"}]`
  debug(`Returning endpoints: ${endpoints}`)
  return endpoints
}

/**
 * Handle GET /api/logs request
 */
export function handle_get_logs(requestPtr: usize, requestLen: usize): string {
  // Decode request JSON from memory
  const requestBytes = new Uint8Array(i32(requestLen))
  for (let i: i32 = 0; i < i32(requestLen); i++) {
    requestBytes[i] = load<u8>(requestPtr + <usize>i)
  }
  const requestJson = String.UTF8.decode(requestBytes.buffer)

  debug('Handling /api/logs request')

  // Parse request (simple extraction of query params)
  let numLines: i32 = 2000

  // Extract 'lines' query parameter if present
  const linesIndex = requestJson.indexOf('"lines"')
  if (linesIndex >= 0) {
    const colonIndex = requestJson.indexOf(':', linesIndex)
    if (colonIndex >= 0) {
      const valueStart = colonIndex + 1
      let valueEnd = requestJson.indexOf(',', valueStart)
      if (valueEnd < 0) valueEnd = requestJson.indexOf('}', valueStart)
      if (valueEnd > valueStart) {
        const valueStr = requestJson.substring(valueStart, valueEnd).trim()
        // Remove quotes if present
        const cleanValue = valueStr.replaceAll('"', '')
        const parsed = I32.parseInt(cleanValue)
        if (parsed > 0) {
          numLines = min(parsed, 50000)
        }
      }
    }
  }

  debug(`Fetching ${numLines.toString()} log lines`)

  // Try journalctl first
  let rawLines = getLogsFromJournalctl(numLines)

  // If journalctl failed, try reading from file
  if (rawLines.length == 0) {
    debug('Journalctl failed, trying file-based logs')
    rawLines = getLogsFromFile('/var/log/syslog', numLines)
  }

  if (rawLines.length == 0) {
    // Return error response
    return `{"statusCode":404,"headers":{"Content-Type":"application/json"},"body":"{\\"error\\":\\"Could not find logs\\",\\"message\\":\\"Tried journalctl and file-based logs\\"}"}`
  }

  debug(`Got ${rawLines.length.toString()} raw log lines from journalctl`)

  // With short-iso format, we can handle many more lines (no bloated metadata!)
  const maxLines = min(rawLines.length, numLines)
  debug(`Processing ${maxLines.toString()} of ${rawLines.length.toString()} log lines`)

  // Build response - return body as JSON array (not string!)
  debug(`Building response array`)

  // Build JSON array manually - escape each line for JSON
  const linesParts: string[] = []
  for (let i = 0; i < maxLines; i++) {
    let line = rawLines[i]

    // Fast escape by removing/replacing control characters
    // Instead of complex escaping, just remove problematic chars
    let cleaned = ''
    for (let j = 0; j < line.length; j++) {
      const code = line.charCodeAt(j)
      const ch = line.charAt(j)

      if (ch == '\\') cleaned += '\\\\'
      else if (ch == '"') cleaned += '\\"'
      else if (code < 32) cleaned += ' '  // Replace ALL control chars with space
      else cleaned += ch
    }

    linesParts.push('"' + cleaned + '"')
  }

  const linesArray = '[' + linesParts.join(',') + ']'

  debug(`Built array with ${maxLines.toString()} lines`)

  // Return body as object (wasm-loader will send it)
  const response = '{"statusCode":200,"headers":{"Content-Type":"application/json"},"body":{"lines":' +
                   linesArray +
                   ',"count":' + maxLines.toString() +
                   ',"source":"journalctl","format":"short-iso"}}'

  debug(`Response complete, length: ${response.length.toString()}`)

  return response
}
