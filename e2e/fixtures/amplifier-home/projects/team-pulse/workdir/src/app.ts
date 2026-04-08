import { createServer } from 'http'

const PORT = process.env.PORT || 3000

interface MetricPoint {
  timestamp: Date
  velocity: number
  bugs: number
}

function calculateAverage(points: MetricPoint[]): number {
  if (points.length === 0) return 0
  const total = points.reduce((sum, p) => sum + p.velocity, 0)
  return total / points.length
}

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok' }))
})

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})