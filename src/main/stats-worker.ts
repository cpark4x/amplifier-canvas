/**
 * Worker thread for streaming session stats from large events.jsonl files.
 * Keeps the main Electron thread responsive during background discovery.
 *
 * Usage from main thread:
 *   const { promptCount, toolCallCount } = await runStatsWorker(filePath)
 */

import { parentPort, workerData } from 'worker_threads'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const filePath = workerData.filePath as string

let promptCount = 0
let toolCallCount = 0

const rl = createInterface({
  input: createReadStream(filePath, { encoding: 'utf-8' }),
  crlfDelay: Infinity,
})

rl.on('line', (line) => {
  // Fast string match — avoid JSON.parse on 100K+ character lines
  if (line.includes('"prompt:submit"') || line.includes('"user_message"')) {
    promptCount++
  } else if (line.includes('"tool:pre"') || line.includes('"tool_call"')) {
    toolCallCount++
  }
})

rl.on('close', () => {
  parentPort?.postMessage({ promptCount, toolCallCount })
})

rl.on('error', () => {
  parentPort?.postMessage({ promptCount, toolCallCount })
})