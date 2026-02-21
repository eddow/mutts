// Type declarations for Chrome DevTools Extension API

declare namespace chrome {
	namespace extension {
		interface LastError {
			message?: string
			isException?: boolean
		}
	}
	namespace devtools {
		namespace panels {
			interface ExtensionPanel {
				onShown: { addListener: (callback: () => void) => void }
				onHidden: { addListener: (callback: () => void) => void }
			}
		}
	}
}

interface ChromeDevToolsInspectedWindow {
	eval(
		expression: string,
		callback?: (result: any, exceptionInfo?: chrome.extension.LastError) => void
	): void
}

interface ChromeDevToolsPanels {
	create(
		title: string,
		iconPath: string,
		pagePath: string,
		callback?: (panel: chrome.devtools.panels.ExtensionPanel) => void
	): void
}

interface ChromeDevTools {
	inspectedWindow: ChromeDevToolsInspectedWindow
	panels: ChromeDevToolsPanels
}

interface Window {
	chrome?: {
		devtools?: ChromeDevTools
	}
	__MUTTS_DEBUG__?: {
		getGraph: () => any
		setEffectName?: (effect: any, name: string) => void
		setObjectName?: (obj: any, name: string) => void
		registerEffect?: (effect: any) => void
		registerObject?: (obj: any) => void
	}
	__REACTIVITY_DEVTOOLS__?: {
		getGraph: () => any
	}
}

