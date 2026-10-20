import net from 'node:net'

const PORTS = [3000, 3001]

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const done = (inUse) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(inUse)
    }
    socket.setTimeout(1_000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

const busy = []
for (const port of PORTS) {
  if (await isPortInUse(port)) busy.push(port)
}

if (busy.length) {
  console.error(
    `[dev] Port ${busy.join(' and ')} is already in use. A dev server is probably already running.`
  )
  console.error(
    '[dev] Stop it before starting another: Next silently falls back to 3001, and two dev servers sharing .next corrupt the build.'
  )
  process.exit(1)
}
