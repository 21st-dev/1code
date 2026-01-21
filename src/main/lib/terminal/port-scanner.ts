import { execFile } from "node:child_process"
import { promisify } from "node:util"
import os from "node:os"
import pidtree from "pidtree"

const execFileAsync = promisify(execFile)

export interface PortInfo {
	port: number
	pid: number
	address: string
	processName: string
}

// Cache for port lookups to avoid repeated expensive calls
const portCache = new Map<
	string,
	{ ports: PortInfo[]; timestamp: number }
>()
const PORT_CACHE_TTL = 2000 // 2 seconds - ports don't change that fast

// Cache for process names
const processNameCache = new Map<number, { name: string; timestamp: number }>()
const PROCESS_NAME_CACHE_TTL = 10000 // 10 seconds

/**
 * Get all child PIDs of a process (including the process itself)
 */
export async function getProcessTree(pid: number): Promise<number[]> {
	try {
		return await pidtree(pid, { root: true })
	} catch {
		// Process may have exited
		return []
	}
}

/**
 * Get listening TCP ports for a set of PIDs (async, cached)
 * Cross-platform implementation using lsof (macOS/Linux) or netstat (Windows)
 */
export async function getListeningPortsForPids(
	pids: number[],
): Promise<PortInfo[]> {
	if (pids.length === 0) return []

	// Check cache first
	const cacheKey = pids.sort().join(",")
	const cached = portCache.get(cacheKey)
	if (cached && Date.now() - cached.timestamp < PORT_CACHE_TTL) {
		return cached.ports
	}

	const platform = os.platform()
	let ports: PortInfo[] = []

	if (platform === "darwin" || platform === "linux") {
		ports = await getListeningPortsLsof(pids)
	} else if (platform === "win32") {
		ports = await getListeningPortsWindows(pids)
	}

	// Update cache
	portCache.set(cacheKey, { ports, timestamp: Date.now() })
	return ports
}

/**
 * macOS/Linux implementation using lsof (async)
 */
async function getListeningPortsLsof(pids: number[]): Promise<PortInfo[]> {
	try {
		const pidArg = pids.join(",")
		const pidSet = new Set(pids)
		// -p: filter by PIDs
		// -iTCP: only TCP connections
		// -sTCP:LISTEN: only listening sockets
		// -P: don't convert port numbers to names
		// -n: don't resolve hostnames
		// Note: lsof may ignore -p filter if PIDs don't exist or have no matches,
		// so we must validate PIDs in the output against our requested set
		const { stdout: output } = await execFileAsync(
			"sh",
			["-c", `lsof -p ${pidArg} -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true`],
			{ maxBuffer: 10 * 1024 * 1024, timeout: 5000 },
		)

		if (!output.trim()) return []

		const ports: PortInfo[] = []
		const lines = output.trim().split("\n").slice(1)

		for (const line of lines) {
			if (!line.trim()) continue

			// Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
			// Example: node 12345 user 23u IPv4 0x1234 0t0 TCP *:3000 (LISTEN)
			const columns = line.split(/\s+/)
			if (columns.length < 10) continue

			const processName = columns[0]
			const pid = Number.parseInt(columns[1], 10)

			// CRITICAL: Verify the PID is in our requested set
			// lsof ignores -p filter when PIDs don't exist, returning all TCP listeners
			if (!pidSet.has(pid)) continue

			const name = columns[columns.length - 2] // NAME column (e.g., *:3000), before (LISTEN)

			// Parse address:port from NAME column
			// Formats: *:3000, 127.0.0.1:3000, [::1]:3000, [::]:3000
			const match = name.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/)
			if (match) {
				const address = match[1] || match[2] || "*"
				const port = Number.parseInt(match[3], 10)

				if (port < 1 || port > 65535) continue

				ports.push({
					port,
					pid,
					address: address === "*" ? "0.0.0.0" : address,
					processName,
				})
			}
		}

		return ports
	} catch {
		return []
	}
}

/**
 * Windows implementation using netstat (async)
 */
async function getListeningPortsWindows(pids: number[]): Promise<PortInfo[]> {
	try {
		const { stdout: output } = await execFileAsync("netstat", ["-ano"], {
			maxBuffer: 10 * 1024 * 1024,
			timeout: 5000,
		})

		const pidSet = new Set(pids)
		const ports: PortInfo[] = []
		const processNames = new Map<number, string>()

		// Collect unique PIDs first, then batch fetch names
		const uniquePids = new Set<number>()
		const parsedLines: Array<{
			pid: number
			address: string
			port: number
		}> = []

		for (const line of output.split("\n")) {
			if (!line.includes("LISTENING")) continue

			// Format: TCP 0.0.0.0:3000 0.0.0.0:0 LISTENING 12345
			const columns = line.trim().split(/\s+/)
			if (columns.length < 5) continue

			const pid = Number.parseInt(columns[columns.length - 1], 10)
			if (!pidSet.has(pid)) continue

			const localAddr = columns[1]
			// Parse address:port - handles both IPv4 and IPv6
			// IPv4: 0.0.0.0:3000
			// IPv6: [::]:3000
			const match = localAddr.match(/^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/)
			if (match) {
				const address = match[1] || match[2] || "0.0.0.0"
				const port = Number.parseInt(match[3], 10)

				if (port < 1 || port > 65535) continue

				uniquePids.add(pid)
				parsedLines.push({ pid, address, port })
			}
		}

		// Fetch process names in parallel
		await Promise.all(
			Array.from(uniquePids).map(async (pid) => {
				const name = await getProcessNameWindowsAsync(pid)
				processNames.set(pid, name)
			}),
		)

		// Build final result
		for (const { pid, address, port } of parsedLines) {
			ports.push({
				port,
				pid,
				address,
				processName: processNames.get(pid) || "unknown",
			})
		}

		return ports
	} catch {
		return []
	}
}

/**
 * Get process name for a PID on Windows (async with cache)
 */
async function getProcessNameWindowsAsync(pid: number): Promise<string> {
	// Check cache first
	const cached = processNameCache.get(pid)
	if (cached && Date.now() - cached.timestamp < PROCESS_NAME_CACHE_TTL) {
		return cached.name
	}

	let name = "unknown"
	try {
		const { stdout: output } = await execFileAsync(
			"wmic",
			["process", "where", `processid=${pid}`, "get", "name"],
			{ timeout: 2000 },
		)
		const lines = output.trim().split("\n")
		if (lines.length >= 2) {
			const parsedName = lines[1].trim()
			name = parsedName.replace(/\.exe$/i, "") || "unknown"
		}
	} catch {
		// wmic is deprecated, try PowerShell as fallback
		try {
			const { stdout: output } = await execFileAsync(
				"powershell",
				["-Command", `(Get-Process -Id ${pid}).ProcessName`],
				{ timeout: 2000 },
			)
			name = output.trim() || "unknown"
		} catch {
			// Ignore
		}
	}

	// Update cache
	processNameCache.set(pid, { name, timestamp: Date.now() })
	return name
}

/**
 * Get process name for a PID (cross-platform, async with cache)
 */
export async function getProcessName(pid: number): Promise<string> {
	// Check cache first
	const cached = processNameCache.get(pid)
	if (cached && Date.now() - cached.timestamp < PROCESS_NAME_CACHE_TTL) {
		return cached.name
	}

	const platform = os.platform()
	let name = "unknown"

	if (platform === "win32") {
		name = await getProcessNameWindowsAsync(pid)
	} else {
		// macOS/Linux
		try {
			const { stdout: output } = await execFileAsync(
				"sh",
				["-c", `ps -p ${pid} -o comm= 2>/dev/null || true`],
				{ timeout: 2000 },
			)
			const parsedName = output.trim()
			// On macOS, comm may be truncated. The full path can be gotten with -o command=
			// but comm is usually sufficient for display purposes
			name = parsedName || "unknown"
		} catch {
			name = "unknown"
		}
	}

	// Update cache
	processNameCache.set(pid, { name, timestamp: Date.now() })
	return name
}
