const graphEl = document.getElementById('graph')
const refreshBtn = document.getElementById('refresh')
const layoutSelect = document.getElementById('layout')
const hideIsolatedInput = document.getElementById('hideIsolated')
const searchInput = document.getElementById('search')
const statusEl = document.getElementById('status')

// Vis Network is exposed as a global UMD bundle on window
// In a module context we must read it from window explicitly.
const Vis = window.vis
const VisNetwork = Vis && Vis.Network

let network
let currentGraph = { nodes: [], edges: [] }
let lastRawGraph = null

const sampleGraph = {
  nodes: [
    { id: 'effect_root', label: 'effect:renderRoot', type: 'effect', depth: 0 },
    { id: 'effect_child', label: 'effect:updateChild', type: 'effect', depth: 1, parentId: 'effect_root' },
    { id: 'effect_external', label: 'External', type: 'external', depth: 0 },
  ],
  edges: [
    { id: 'external->root:user.name', source: 'effect_external', target: 'effect_root', type: 'cause', label: 'user.name' },
    { id: 'root->child:todos.length', source: 'effect_root', target: 'effect_child', type: 'cause', label: 'todos.length' },
  ],
  meta: { sample: true, generatedAt: Date.now(), devtoolsEnabled: false },
}

function setStatus(message, tone = 'info') {
  statusEl.textContent = message
  statusEl.dataset.tone = tone
}

function getOptions(mode) {
  const base = {
    autoResize: false,
    width: '100%',
    height: '100%',
    interaction: { hover: true },
    edges: {
      arrows: 'to',
      smooth: false,
      font: { size: 11, strokeWidth: 0, color: '#c9d1d9' },
    },
    nodes: {
      shape: 'box',
      margin: 10,
      font: { color: '#f4f4f4', face: 'system-ui', size: 13 },
      color: {
        background: '#1f6feb',
        border: '#4c8ef7',
        highlight: { background: '#0d419d', border: '#58a6ff' },
      },
    },
    groups: {
      effect: {
        color: { background: '#1f6feb', border: '#4c8ef7', highlight: { background: '#0d419d', border: '#58a6ff' } },
      },
      external: {
        color: { background: '#f39c12', border: '#f7b347', highlight: { background: '#b9770e', border: '#f0a45d' } },
        shape: 'ellipse',
      },
    },
    physics: false,
  }

  if (mode === 'hierarchical') {
    base.layout = {
      hierarchical: {
        direction: 'UD',
        levelSeparation: 80,
        nodeSpacing: 80,
        parentCentralization: true,
        sortMethod: 'directed',
      },
    }
    base.physics = false
  } else {
    base.layout = { randomSeed: 42 }
    base.physics = {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.2,
        springLength: 200,
        springConstant: 0.03,
      },
      stabilization: { iterations: 200, fit: true },
    }
  }

  return base
}

function ensureNetwork() {
  if (!VisNetwork) {
    console.error('Vis Network bundle not available on window.vis')
    setStatus('Vis Network failed to load', 'error')
    return
  }
  if (!network) {
    network = new VisNetwork(graphEl, currentGraph, getOptions(layoutSelect.value))
    network.on('selectNode', (params) => {
      if (params.nodes.length > 0) {
        network.focus(params.nodes[0], { scale: 1.2, animation: { duration: 300, easing: 'easeInOutQuad' } })
      }
    })
  } else {
    network.setOptions(getOptions(layoutSelect.value))
  }
}

function toVisGraph(graph) {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const rawEdges = Array.isArray(graph?.edges) ? graph.edges : []
  const effectNodes = rawNodes.filter((node) => node.type === 'effect' || node.type === 'external')

  // Optionally hide nodes that have no incident edges
  let connectedIds = null
  if (hideIsolatedInput?.checked) {
    connectedIds = new Set()
    for (const edge of rawEdges) {
      if (edge.type !== 'cause') continue
      if (edge.source) connectedIds.add(edge.source)
      if (edge.target) connectedIds.add(edge.target)
    }
  }

  const visNodes = effectNodes.map((node) => ({
    id: node.id,
    label: node.label,
    group: node.type,
    level: node.depth ?? 0,
    title: node.debugName || node.label,
  }))

  const causeEdges = rawEdges.filter((edge) => edge.type === 'cause')
  const visEdges = causeEdges.map((edge) => ({
    id: edge.id,
    from: edge.source,
    to: edge.target,
    label: edge.label,
    width: Math.min(6, 1 + (edge.count ?? 1) * 0.5),
    color: edge.type === 'cause' ? '#ff7b72' : '#8b949e',
  }))

  return { nodes: visNodes, edges: visEdges }
}

function renderGraph(graph) {
  ensureNetwork()
  if (!network) return
  lastRawGraph = graph
  const visGraph = toVisGraph(graph)
  currentGraph = visGraph
  network.setData(visGraph)
  const mode = layoutSelect ? layoutSelect.value : 'hierarchical'
  network.setOptions(getOptions(mode))
  network.fit({ animation: { duration: 200, easing: 'easeInOutQuad' } })

  const meta = graph.meta || {}
  const effectCount = visGraph.nodes.length
  const edgeCount = visGraph.edges.length
  const tone = meta.sample ? 'warn' : 'ok'
  setStatus(
    effectCount
      ? `${effectCount} effects, ${edgeCount} cause edges${meta.sample ? ' (sample)' : ''}`
      : 'No effect data available',
    tone,
  )
}

function fetchGraphFromPage() {
  setStatus('Fetching graph from inspected page…')
  const expression = `(() => {
    const api = window.__MUTTS_DEVTOOLS__ || window.__REACTIVITY_DEVTOOLS__;
    if (!api || typeof api.getGraph !== 'function') {
      return null;
    }
    try {
      return api.getGraph();
    } catch (error) {
      return { error: String(error) };
    }
  })()`

  chrome.devtools.inspectedWindow.eval(
    expression,
    (result, exceptionInfo) => {
      if (exceptionInfo && exceptionInfo.isException) {
        console.error('Eval exception', exceptionInfo)
        setStatus('Eval failed. Showing sample graph', 'error')
        renderGraph(sampleGraph)
        return
      }

      if (!result || result.error) {
        if (result && result.error) {
          console.error('Graph error', result.error)
        }
        setStatus('No graph exposed. Showing sample graph', 'warn')
        renderGraph(sampleGraph)
        return
      }

      renderGraph(result)
    },
  )
}

function handleSearch(event) {
  if (!network) return
  const query = event.target.value.trim().toLowerCase()
  if (!query) {
    network.unselectAll()
    return
  }
  const matches = currentGraph.nodes.filter((node) => node.label.toLowerCase().includes(query)).map((node) => node.id)
  if (matches.length === 0) {
    network.unselectAll()
    setStatus('No matching effects', 'warn')
    return
  }
  network.selectNodes(matches)
  network.focus(matches[0], { scale: 1.1, animation: { duration: 400 } })
  setStatus(`Highlighted ${matches.length} node(s)`, 'info')
}

refreshBtn.addEventListener('click', () => fetchGraphFromPage())
if (layoutSelect) {
  layoutSelect.addEventListener('change', (event) => {
    const mode = event.target.value
    if (!network || !lastRawGraph) return
    network.setOptions(getOptions(mode))
    const visGraph = toVisGraph(lastRawGraph)
    currentGraph = visGraph
    network.setData(visGraph)
    network.fit({ animation: { duration: 200, easing: 'easeOutQuad' } })
  })
}
if (hideIsolatedInput) {
  hideIsolatedInput.addEventListener('change', () => {
    if (!network || !lastRawGraph) return
    const visGraph = toVisGraph(lastRawGraph)
    currentGraph = visGraph
    network.setData(visGraph)
    network.fit({ animation: { duration: 200, easing: 'easeOutQuad' } })
  })
}
searchInput.addEventListener('input', handleSearch)

renderGraph(sampleGraph)
setStatus('Sample graph ready. Click refresh to load live data.')
