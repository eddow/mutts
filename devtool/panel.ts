/// <reference path="./devtools.d.ts" />
import { type Edge, type Node, Network, type Options } from 'vis-network'

type LayoutMode = 'hierarchical' | 'physics'

interface RawNode {
	id: string
	label?: string
	type?: string
	depth?: number
	debugName?: string
	parentId?: string
}

interface RawEdge {
	id?: string
	source?: string
	target?: string
	type?: string
	label?: string
	count?: number
}

interface RawGraph {
	nodes?: RawNode[]
	edges?: RawEdge[]
	meta?: Record<string, unknown>
}

interface VisGraph {
	nodes: Node[]
	edges: Edge[]
}

const graphEl = document.getElementById('graph')
const refreshBtn = document.getElementById('refresh')
const layoutSelect = document.getElementById('layout') as HTMLSelectElement
const hideIsolatedInput = document.getElementById('hideIsolated') as HTMLInputElement
const searchInput = document.getElementById('search') as HTMLInputElement
const statusEl = document.getElementById('status')

let network: Network | null = null
let lastRawGraph: RawGraph | null = null
let currentGraph: VisGraph = { nodes: [], edges: [] }

const NODE_COLORS: Record<string, { background: string; border: string }> = {
	effect: { background: '#1f6feb', border: '#388bfd' },
	external: { background: '#8b5cf6', border: '#a78bfa' },
	state: { background: '#238636', border: '#2ea043' },
}

function setStatus(message: string, tone: string = 'info') {
	if (!statusEl) return
	statusEl.textContent = message
	if (statusEl.dataset) statusEl.dataset.tone = tone
}

function getOptions(mode: LayoutMode, nodeCount: number): Options {
	// Fixed scale for consistent spacing
	const scale = 1.0

	const base: Options = {
		autoResize: false,
		width: '100%',
		height: '100%',
		interaction: { hover: true, tooltipDelay: 150 },
		nodes: {
			shape: 'box',
			margin: { top: 8, right: 14, bottom: 8, left: 14 },
			font: { color: '#f4f4f4', face: 'system-ui', size: 14 },
			borderWidth: 2,
		},
		edges: {
			arrows: { to: { enabled: true, scaleFactor: 0.7 } },
			smooth: { enabled: true, type: 'cubicBezier', roundness: 0.4 },
			font: { size: 11, strokeWidth: 2, strokeColor: '#0d1117', color: '#c9d1d9', align: 'top' },
			color: { color: '#484f58', highlight: '#ff7b72', hover: '#ff7b72' },
		},
	}

	if (mode === 'hierarchical') {
		const levelSep = Math.round(100 * scale)
		const nodeSep = Math.round(80 * scale)
		const treeSep = Math.round(120 * scale)

		base.layout = {
			hierarchical: {
				direction: 'UD',
				levelSeparation: levelSep,
				nodeSpacing: nodeSep,
				treeSpacing: treeSep,
				blockShifting: true,
				edgeMinimization: true,
				parentCentralization: true,
				sortMethod: 'directed',
				shakeTowards: 'leaves',
			},
		}
		base.physics = {
			enabled: true,
			solver: 'hierarchicalRepulsion',
			hierarchicalRepulsion: {
				nodeDistance: nodeSep,
				centralGravity: 0.2,
				springLength: levelSep * 0.8,
				springConstant: 0.02,
				damping: 0.09,
			},
			stabilization: { enabled: true, iterations: 150, fit: true },
		}
	} else {
		base.layout = { hierarchical: false }
		base.physics = {
			enabled: true,
			solver: 'forceAtlas2Based',
			forceAtlas2Based: {
				gravitationalConstant: -800 * scale,
				centralGravity: 0.003,
				springLength: Math.round(400 * scale),
				springConstant: 0.03,
				damping: 0.4,
			},
			stabilization: { enabled: true, iterations: 300, fit: true },
		}
	}

	return base
}

function ensureNetwork() {
	if (network || !graphEl) return
	network = new Network(graphEl, { nodes: [], edges: [] }, getOptions('hierarchical', 0))
}

function toVisGraph(graph: RawGraph): VisGraph {
	const rawNodes: RawNode[] = Array.isArray(graph?.nodes) ? graph.nodes : []
	const rawEdges: RawEdge[] = Array.isArray(graph?.edges) ? graph.edges : []

	// Build set of node IDs that participate in any edge (for hide-isolated filter)
	let connectedIds: Set<string> | null = null
	if (hideIsolatedInput?.checked) {
		connectedIds = new Set<string>()
		for (const edge of rawEdges) {
			if (!edge) continue
			if (edge.source) connectedIds.add(String(edge.source))
			if (edge.target) connectedIds.add(String(edge.target))
		}
	}

	// Include all node types (effect, external, state)
	const nodeIdSet = new Set<string>()
	const nodes: Node[] = rawNodes
		.filter((n): n is RawNode => !!n)
		.filter((n) => !connectedIds || connectedIds.has(String(n.id)))
		.map((n) => {
			const depth = typeof n.depth === 'number' ? n.depth : 0
			const colors = NODE_COLORS[n.type ?? 'effect'] ?? NODE_COLORS.effect
			nodeIdSet.add(String(n.id))
			return {
				id: n.id,
				label: String(n.label || n.id),
				group: n.type,
				title: n.debugName || n.label,
				color: colors,
			} as Node
		})

	// Only keep edges whose both endpoints exist in the filtered node set
	const edges: Edge[] = rawEdges
		.filter((e): e is RawEdge => !!e && !!e.source && !!e.target)
		.filter((e) => nodeIdSet.has(String(e.source)) && nodeIdSet.has(String(e.target)))
		.map((e) => ({
			id: e.id || `${e.source}->${e.target}`,
			from: e.source,
			to: e.target,
			label: String(e.label || ''),
			width: Math.min(6, 1 + Number(e.count || 0)),
			dashes: e.type === 'dependency',
		}))

	return { nodes, edges }
}

function renderGraph(graph: RawGraph) {
	ensureNetwork()
	if (!network) return
	lastRawGraph = graph
	const visGraph = toVisGraph(graph)
	currentGraph = visGraph
	const mode: LayoutMode = layoutSelect?.value === 'hierarchical' ? 'hierarchical' : 'physics'
	network.setOptions(getOptions(mode, visGraph.nodes.length))
	network.setData(visGraph)
	network.once('stabilizationIterationsDone', () => {
		network!.fit({ animation: { duration: 300, easingFunction: 'easeInOutCubic' } })
	})
}

function handleGraphResult(result: RawGraph | null | { error?: string }) {
	if (!result || ('error' in result && result.error)) {
		if (result && 'error' in result) console.error('Graph error', result.error)
		setStatus('No graph exposed', 'warn')
		return
	}
	const graph = result as RawGraph
	renderGraph(graph)
	const countNodes = graph.nodes?.length ?? 0
	const countEdges = graph.edges?.length ?? 0
	setStatus(`Showing ${countNodes} nodes / ${countEdges} edges`, 'ok')
}

function fetchGraphFromPage(): boolean {
	const api = (window as any).__MUTTS_DEVTOOLS__ ?? (window as any).__REACTIVITY_DEVTOOLS__
	if (!api || typeof api.getGraph !== 'function') return false
	try {
		handleGraphResult(api.getGraph())
		return true
	} catch (e) {
		handleGraphResult({ error: String(e) })
		return true
	}
}

function fetchGraph() {
	setStatus('Fetching graph…')

	// Chrome DevTools extension context
	if (window.chrome?.devtools?.inspectedWindow) {
		const expr = `(() => {
			const api = (window.__MUTTS_DEVTOOLS__ || window.__REACTIVITY_DEVTOOLS__);
			if (!api || typeof api.getGraph !== 'function') return null;
			try { return api.getGraph(); } catch (e) { return { error: String(e) }; }
		})()`
		window.chrome.devtools.inspectedWindow.eval(expr, function (result, exceptionInfo) {
			if (exceptionInfo?.isException) {
				console.error('Eval exception', exceptionInfo)
				setStatus('Eval failed – see panel console', 'error')
				return
			}
			handleGraphResult(result)
		})
		return
	}

	// Standalone fallback: same-page API (for testing without extension)
	if (!fetchGraphFromPage()) {
		setStatus('No devtools API found — click "Enable" on the test page first', 'warn')
	}
}

function init() {
	if (refreshBtn) {
		refreshBtn.addEventListener('click', function () {
			fetchGraph()
		})
	}
	if (layoutSelect) {
		layoutSelect.addEventListener('change', function () {
			if (lastRawGraph) renderGraph(lastRawGraph)
		})
	}
	if (hideIsolatedInput) {
		hideIsolatedInput.addEventListener('change', function () {
			if (lastRawGraph) renderGraph(lastRawGraph)
		})
	}
	if (searchInput) {
		searchInput.addEventListener('input', (event: Event) => {
			if (!network) return
			const target = event.target as HTMLInputElement
			const query = (target?.value ?? '').toLowerCase()
			if (!query) {
				network.unselectAll()
				return
			}
			const matches = currentGraph.nodes
				.filter((n) => String(n.label ?? '').toLowerCase().includes(query))
				.map((n) => n.id as string)
			if (!matches.length) {
				setStatus('No matching nodes', 'warn')
				network.unselectAll()
				return
			}
			network.selectNodes(matches)
			network.focus(matches[0], { animation: { duration: 300, easingFunction: 'easeInOutCubic' }, scale: 1.2 })
		})
	}
}

if (graphEl) {
	init()
	// Auto-fetch on load (works in both extension and standalone mode)
	fetchGraph()
}


