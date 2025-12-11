// Small bootstrap script that registers the custom DevTools panel.
// The global `chrome` object is provided by the DevTools environment.

// @ts-ignore
chrome.devtools.panels.create('Mutts Reactivity', '', 'panel.html', function () {})


