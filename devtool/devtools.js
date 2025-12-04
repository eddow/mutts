chrome.devtools.panels.create(
  "Mutts Reactivity",
  "",
  "panel.html",
  function (panel) {
    if (chrome.runtime.lastError) {
      console.error("Failed to create panel:", chrome.runtime.lastError);
    } else {
      console.log("Mutts Reactivity panel created successfully");
    }
  }
);
