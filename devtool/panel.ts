/// <reference path="./devtools.d.ts" />
import { Network, Options } from 'vis-network'

// DevTools panel script (plain JS in a .ts file so Rollup can bundle it)

const graphEl = document.getElementById('graph')
const refreshBtn = document.getElementById('refresh')
const layoutSelect = document.getElementById('layout') as HTMLSelectElement
const hideIsolatedInput = document.getElementById('hideIsolated') as HTMLInputElement
const searchInput = document.getElementById('search') as HTMLInputElement
const statusEl = document.getElementById('status')

let network
let lastRawGraph = null
let currentGraph = { nodes: [], edges: [] }

function setStatus(message, tone = 'info') {
	if (!statusEl) return
	statusEl.textContent = message
	statusEl.dataset && (statusEl.dataset.tone = String(tone))
}

function getOptions(mode: 'hierarchical' | 'physics') {
	const base: Options = {
		autoResize: false,
		width: '100%',
		height: '100%',
		interaction: { hover: true },
		nodes: {
			shape: 'box',
			margin: { top: 10, right: 10, bottom: 10, left: 10 },
			font: { color: '#f4f4f4', face: 'system-ui', size: 13 },
		},
		edges: {
			arrows: 'to',
			smooth: false,
			font: { size: 11, strokeWidth: 0, color: '#c9d1d9' },
		},
	}

	if (mode === 'hierarchical') {
		base.layout = {
			hierarchical: {
				direction: 'UD',
				levelSeparation: 300,
				nodeSpacing: 150,
				treeSpacing: 300,
				blockShifting: true,
				edgeMinimization: true,
				parentCentralization: true,
				sortMethod: 'directed',
				shakeTowards: 'leaves',
			},
		}
		// Enable light physics to add vertical variation to nodes at same level
		base.physics = {
			enabled: true,
			solver: 'hierarchicalRepulsion',
			hierarchicalRepulsion: {
				nodeDistance: 120,
				centralGravity: 0.0,
				springLength: 100,
				springConstant: 0.01,
				damping: 0.09,
			},
			stabilization: {
				enabled: true,
				iterations: 100,
				fit: true,
			},
		}
	} else {
		// Force/physics layout
		base.physics = {
			enabled: true,
			solver: 'forceAtlas2Based',
			stabilization: {
				enabled: true,
				iterations: 200,
				fit: true,
			},
			forceAtlas2Based: {
				gravitationalConstant: -50,
				centralGravity: 0.01,
				springLength: 100,
				springConstant: 0.08,
				damping: 0.4,
			},
		}
	}

	return base
}

function ensureNetwork() {
	if (network || !graphEl) return
	network = new Network(graphEl, { nodes: [], edges: [] }, getOptions('hierarchical'))
}

function toVisGraph(graph) {
	const rawNodes = Array.isArray(graph && graph.nodes) ? graph.nodes : []
	const rawEdges = Array.isArray(graph && graph.edges) ? graph.edges : []

	let connectedIds: Set<string> | null = null
	if (hideIsolatedInput && hideIsolatedInput.checked) {
		connectedIds = new Set()
		for (const edge of rawEdges) {
			if (!edge || !['cause', 'effect'].includes(edge.type || '')) continue
			if (edge.source) connectedIds.add(String(edge.source))
			if (edge.target) connectedIds.add(String(edge.target))
		}
	}

	const nodes = rawNodes
		.filter((n) => n && (n.type === 'effect' || n.type === 'external'))
		.filter((n) => !connectedIds || connectedIds.has(String(n.id)))
		.map((n) => {
			const depth = typeof n.depth === 'number' ? n.depth : 0
			return {
				id: n.id,
				label: String(n.label || n.id),
				group: n.type,
				level: depth,
				title: n.debugName || n.label,
			}
		})

	// Debug: log edge types to help diagnose issues
	if (rawEdges.length > 0) {
		const edgeTypes = new Set(rawEdges.map((e) => e?.type).filter(Boolean))
		console.log('[DevTools] Edge types found:', Array.from(edgeTypes))
	}

	const edges = rawEdges
		.filter((e) => e && ['cause', 'effect'].includes(e.type || ''))
		.map((e) => ({
			id: e.id || (e.source + '->' + e.target),
			from: e.source,
			to: e.target,
			label: String(e.label || ''),
			width: Math.min(6, 1 + Number(e.count || 0)),
			color: '#ff7b72',
		}))

	// Debug: log node and edge counts
	console.log('[DevTools] Graph stats:', {
		totalRawNodes: rawNodes.length,
		filteredNodes: nodes.length,
		totalRawEdges: rawEdges.length,
		filteredEdges: edges.length,
		nodeLevels: nodes.map((n) => ({ id: n.id, level: n.level, label: n.label })),
		edgeCount: edges.length,
		sampleEdges: edges.slice(0, 3).map((e) => ({ from: e.from, to: e.to, label: e.label })),
	})

	return { nodes, edges }
}

function renderGraph(graph) {
	ensureNetwork()
	if (!network) return
	lastRawGraph = graph
	const visGraph = toVisGraph(graph)
	currentGraph = visGraph
	network.setData(visGraph)
	const mode = layoutSelect && layoutSelect.value === 'physics' ? 'physics' : 'hierarchical'
	network.setOptions(getOptions(mode))
	network.fit({ animation: { duration: 200, easing: 'easeInOutCubic' } })
}

function fetchGraph() {
	setStatus('Fetching graph from inspected page…')
	const expr = `(() => {
	const api = (window.__MUTTS_DEVTOOLS__ || window.__REACTIVITY_DEVTOOLS__);
	if (!api || typeof api.getGraph !== 'function') return null;
	try { return api.getGraph(); } catch (e) { return { error: String(e) }; }
})()`

	// call into the inspected page via Chrome DevTools API
	if (window.chrome && window.chrome.devtools && window.chrome.devtools.inspectedWindow) {
		window.chrome.devtools.inspectedWindow.eval(
			expr,
			function (result, exceptionInfo) {
			if (exceptionInfo && exceptionInfo.isException) {
				console.error('Eval exception', exceptionInfo)
				setStatus('Eval failed – see panel console', 'error')
				return
			}
			if (!result || result.error) {
				if (result && result.error) console.error('Graph error', result.error)
				setStatus('No graph exposed', 'warn')
				return
			}
			renderGraph(result)
			const countNodes = Array.isArray(result.nodes) ? result.nodes.length : 0
			const countEdges = Array.isArray(result.edges) ? result.edges.length : 0
			setStatus('Showing ' + countNodes + ' nodes / ' + countEdges + ' edges', 'ok')
		}
	)
	} else {
		setStatus('chrome.devtools API not available in this context', 'error')
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
		searchInput.addEventListener('input', function (event) {
			if (!network || !currentGraph) return
			const target = event.target as HTMLInputElement
			const value = target && target.value ? String(target.value) : ''
			const query = value.toLowerCase()
			if (!query) {
				network.unselectAll()
				return
			}
			const matches = currentGraph.nodes
				.filter(function (n: { label: string; id: string }) {
					return String((n && n.label) || '').toLowerCase().indexOf(query) !== -1
				})
				.map(function (n: { id: string }) {
					return n.id
				})
			if (!matches.length) {
				setStatus('No matching effects', 'warn')
				network.unselectAll()
				return
			}
			network.selectNodes(matches)
			network.focus(matches[0], { animation: { duration: 300 }, scale: 1.1 })
		})
	}
}

if (graphEl) {
	init()
}


