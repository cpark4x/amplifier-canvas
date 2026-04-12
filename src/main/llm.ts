import { spawn, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface InvokeLLMOptions {
  model?: string
  provider?: string
  timeoutMs?: number
}

// --------------------------------------------------------------------------
// Binary resolution
// --------------------------------------------------------------------------

let cachedBinaryPath: string | null = null

/** Reset the cached binary path — exported for testing. */
export function _resetBinaryCache(): void {
  cachedBinaryPath = null
}

/**
 * Resolve the path to the amplifier binary.
 *
 * Resolution order:
 *  1. PATH lookup via `which amplifier`
 *  2. Common install locations:
 *     ~/.local/bin/amplifier, /usr/local/bin/amplifier, /opt/homebrew/bin/amplifier
 *
 * Throws a descriptive error if the binary cannot be found.
 * Caches the resolved path in `cachedBinaryPath`.
 */
export function resolveAmplifierBinary(): string {
  if (cachedBinaryPath !== null) {
    return cachedBinaryPath
  }

  // 1. Check PATH via `which amplifier`
  try {
    const result = execFileSync('which', ['amplifier'], { encoding: 'utf-8' }).trim()
    if (result) {
      cachedBinaryPath = result
      return cachedBinaryPath
    }
  } catch {
    // `which` failed — amplifier is not on PATH
  }

  // 2. Check common install locations
  const fallbackLocations = [
    join(homedir(), '.local', 'bin', 'amplifier'),
    '/usr/local/bin/amplifier',
    '/opt/homebrew/bin/amplifier',
  ]

  for (const location of fallbackLocations) {
    if (existsSync(location)) {
      cachedBinaryPath = location
      return cachedBinaryPath
    }
  }

  throw new Error(
    'amplifier binary not found. ' +
      'Please install it or ensure it is in your PATH. ' +
      'Searched: PATH (via `which amplifier`), ' +
      join(homedir(), '.local', 'bin', 'amplifier') +
      ', /usr/local/bin/amplifier, /opt/homebrew/bin/amplifier',
  )
}

// --------------------------------------------------------------------------
// LLM invocation
// --------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Invoke the amplifier CLI in single-shot mode and return the LLM response.
 *
 * @param prompt  Text written to the process stdin.
 * @param options Optional model, provider, and timeout overrides.
 * @returns       The `.response` string extracted from the JSON output.
 */
export async function invokeLLM(prompt: string, options: InvokeLLMOptions = {}): Promise<string> {
  const binary = resolveAmplifierBinary()
  const { model, provider, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const args: string[] = ['run', '--mode', 'single', '--output-format', 'json']
  if (model) {
    args.push('--model', model)
  }
  if (provider) {
    args.push('--provider', provider)
  }

  return new Promise<string>((resolve, reject) => {
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let timedOut = false

    const proc = spawn(binary, args)

    // Timeout: kill the process and reject
    const timer = setTimeout(() => {
      timedOut = true
      proc.kill()
      reject(new Error(`invokeLLM timeout: process killed after ${timeoutMs}ms`))
    }, timeoutMs)

    // Buffer stdout
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString()
    })

    // Buffer stderr
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
    })

    // Spawn errors (e.g. binary not executable / not found at path)
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(new Error(`Failed to spawn amplifier binary: ${err.message}`))
    })

    // Process exited
    proc.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (timedOut) return // already rejected via timer

      if (code !== 0) {
        reject(
          new Error(
            `amplifier process exited with code ${code}.` +
              (stderrBuffer ? ` stderr: ${stderrBuffer.trim()}` : ''),
          ),
        )
        return
      }

      // Strip non-JSON preamble: find the first line that starts with '{'
      const lines = stdoutBuffer.split('\n')
      const jsonStartIndex = lines.findIndex((line) => line.trimStart().startsWith('{'))

      if (jsonStartIndex === -1) {
        reject(
          new Error(
            `amplifier output did not contain JSON. stdout: ${stdoutBuffer.trim() || '(empty)'}`,
          ),
        )
        return
      }

      const jsonStr = lines.slice(jsonStartIndex).join('\n')

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(jsonStr) as Record<string, unknown>
      } catch {
        reject(
          new Error(`Failed to parse amplifier JSON output: ${stdoutBuffer.trim()}`),
        )
        return
      }

      if (typeof parsed.response !== 'string') {
        reject(
          new Error(
            `amplifier JSON output is missing the 'response' string field. Got: ${jsonStr.trim()}`,
          ),
        )
        return
      }

      resolve(parsed.response)
    })

    // Write prompt to stdin and signal EOF
    proc.stdin?.write(prompt)
    proc.stdin?.end()
  })
}
