# Mutts Reactivity DevTools Demo

A minimal Chrome DevTools panel that visualises the Mutts reactivity graph with Cytoscape.

## Features

- Visualises the effect tree with [Vis Network](https://visjs.org/).
- Shows cause → consequence edges labelled with the object/property that propagated the change.
- Lets you switch between hierarchical (tree) and physics layouts, search for effects, and refresh on demand.

## Folder structure

```
devtool/
├── devtools.html         # registers the custom panel
├── devtools.js           # panel loader (CSP friendly)
├── manifest.json         # Chrome MV3 manifest
├── panel.css             # simple styling
├── panel.html            # panel markup + controls
├── panel.js              # Vis Network wiring + UI
├── test-page.html        # simple test page
├── vis-network.min.css   # Vis styling
├── vis-network.min.js    # Vis Network bundle
└── README.md
```

## Installation

1. In Chrome, open `chrome://extensions`.
2. Enable **Developer mode** (toggle in top-right).
3. Click **Load unpacked** → select `.../mutts/devtool`.
4. The extension should appear in your extensions list.

## Usage

### In your Mutts app

Enable the DevTools API **before** you create effects or reactive state. The easiest spot is right at startup in development builds:

```typescript
import {
  enableDevTools,
  getActiveEffect,
  isDevtoolsEnabled,
  registerEffectForDebug,
  setEffectName,
  setObjectName,
} from 'mutts'

// Enable the global API (only in development)
if (process.env.NODE_ENV === 'development') {
  enableDevTools()
}

const user = reactive({ name: 'Alice', age: 30 })
setObjectName(user, 'user')

const namedEffects = new WeakSet()

effect(() => {
  const current = getActiveEffect()
  if (current && !namedEffects.has(current)) {
    setEffectName(current, 'logUserName')
    namedEffects.add(current)
  }
  console.log(user.name)
})

// Optional: register custom effects created after the panel mounts
if (isDevtoolsEnabled()) {
  registerEffectForDebug(myEffectRef)
}
```

Tip: Use `getActiveEffect()` inside your effect body (once) if you want to set a friendlier name.

### Using the DevTools panel

1. Open your app in Chrome.
2. Open Chrome DevTools (F12).
3. Look for the **"Mutts Reactivity"** tab (should appear alongside Console, Network, etc.).
4. Click the **Refresh** button to load the graph from your app.
5. Use the search box to filter nodes, and change layouts as needed.

### Troubleshooting

**Tab doesn't appear:**
- Make sure the extension is loaded (check `chrome://extensions`).
- Check the browser console for errors.
- Try reloading the extension.
- Make sure you're opening DevTools on a page (not `chrome://` pages).

**"No graph exposed" message / only sample graph:**
- Make sure `enableDevTools()` ran **before** any effects were created.
- Confirm that `window.__MUTTS_DEVTOOLS__` exists and returns data in the page console.
- The panel will fall back to a built-in sample graph when nothing is exposed.

**Graph is empty or missing edges:**
- Create some reactive objects/effects, then click **Refresh**.
- Cause edges are recorded when effects trigger effects, so interact with the app to generate some reactivity.

## API Reference

The `window.__MUTTS_DEVTOOLS__` object provides:

- `getGraph()`: Returns `{ nodes, edges, meta }` describing the effect tree and recorded cause edges.
- `setEffectName(effect, name)`: Assign a debug name to an effect.
- `setObjectName(obj, name)`: Assign a debug name to a reactive object.
- `registerEffect(effect)`: Manually register an effect if you create one outside the normal flow.
- `registerObject(obj)`: Manually register an object.

## Testing

Open `test-page.html` in Chrome to test the extension without your full app.
