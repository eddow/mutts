import { effect } from '../src/reactive/effects'
import type { LineageSegment } from './lineage'
import { reactive } from '../src/reactive/proxy'

/**
 * Displays a floating reactive panel in the browser showing the lineage of triggered effects.
 */
export function showLineagePanel() {
	if (typeof document === 'undefined') return

	// Detect color scheme preference
	const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
	
	// Color schemes
	const colors = isDarkMode ? {
		panelBg: 'rgba(30, 30, 30, 0.95)',
		panelBorder: '#444',
		headerBg: '#8B4513',
		headerText: '#ffffff',
		closeBtn: '#ffffff',
		placeholderText: '#999',
		segmentBorder: '#8B4513',
		titleText: '#ffffff',
		frameText: '#ccc',
		atText: '#888',
		linkText: '#58a6ff',
	} : {
		panelBg: 'rgba(255, 255, 255, 0.95)',
		panelBorder: '#ddd',
		headerBg: '#704214',
		headerText: '#ffffff',
		closeBtn: '#ffffff',
		placeholderText: '#666',
		segmentBorder: '#704214',
		titleText: '#222',
		frameText: '#555',
		atText: '#999',
		linkText: '#005cc5',
	}

	const state = reactive({
		activeLineage: [] as LineageSegment[],
		isVisible: true,
	})

	// onEffectTrigger tracks "this effect" (here nothing) — not useful for a global panel.
	// Would need zone-based events to track all triggers. Panel is cosmetic/experimental (260206).

	// UI Creation
	const panel = document.createElement('div')
	panel.id = 'mutts-lineage-panel'
	Object.assign(panel.style, {
		position: 'fixed',
		bottom: '20px',
		right: '20px',
		width: '400px',
		maxHeight: '80vh',
		backgroundColor: colors.panelBg,
		backdropFilter: 'blur(10px)',
		border: `1px solid ${colors.panelBorder}`,
		borderRadius: '12px',
		boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
		zIndex: '999999',
		fontFamily: 'Inter, system-ui, sans-serif',
		fontSize: '12px',
		display: 'flex',
		flexDirection: 'column',
		overflow: 'hidden',
		transition: 'opacity 0.3s, transform 0.3s',
	})

	const header = document.createElement('div')
	Object.assign(header.style, {
		padding: '12px 16px',
		background: colors.headerBg,
		color: colors.headerText,
		fontWeight: '600',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		cursor: 'grab',
	})
	header.innerHTML = '<span><span style="font-size: 14px; margin-right: 5px;">🦴</span> Mutts Lineage</span>'
	
	const closeBtn = document.createElement('button')
	closeBtn.innerText = '×'
	Object.assign(closeBtn.style, {
		background: 'none',
		border: 'none',
		color: colors.closeBtn,
		fontSize: '20px',
		cursor: 'pointer',
		padding: '0 5px',
	})
	closeBtn.onclick = () => {
		state.isVisible = false
	}
	header.appendChild(closeBtn)
	panel.appendChild(header)

	const content = document.createElement('div')
	Object.assign(content.style, {
		padding: '16px',
		overflowY: 'auto',
		flex: '1',
	})
	panel.appendChild(content)

	document.body.appendChild(panel)

	// Reactivity: Update Visibility
	effect(() => {
		panel.style.opacity = state.isVisible ? '1' : '0'
		panel.style.pointerEvents = state.isVisible ? 'all' : 'none'
		panel.style.transform = state.isVisible ? 'translateY(0)' : 'translateY(20px)'
	})

	// Reactivity: Update Content
	effect(() => {
		if (state.activeLineage.length === 0) {
			content.innerHTML = `<div style="color: ${colors.placeholderText}; font-style: italic; text-align: center; margin-top: 20px;">No effect triggered yet...</div>`
			return
		}

		content.innerHTML = ''
		state.activeLineage.forEach((segment, i) => {
			const segDiv = document.createElement('div')
			Object.assign(segDiv.style, {
				marginBottom: '16px',
				borderLeft: `2px solid ${colors.segmentBorder}`,
				paddingLeft: '12px',
			})

			const title = document.createElement('div')
			Object.assign(title.style, {
				fontWeight: 'bold',
				marginBottom: '6px',
				color: colors.titleText,
			})
			title.innerText = i === 0 ? `📍 Current: ${segment.effectName}` : `↖ Effect: ${segment.effectName}`
			segDiv.appendChild(title)

			segment.stack.forEach(frame => {
				const frameDiv = document.createElement('div')
				Object.assign(frameDiv.style, {
					color: colors.frameText,
					marginBottom: '3px',
					fontSize: '11px',
					whiteSpace: 'nowrap',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					cursor: 'pointer',
				})
				frameDiv.title = frame.raw
				frameDiv.innerHTML = `<span style="color: ${colors.atText}">at</span> ${frame.functionName} <span style="color: ${colors.linkText}; text-decoration: underline;">(${frame.fileName.split('/').pop()}:${frame.lineNumber})</span>`
				segDiv.appendChild(frameDiv)
			})

			content.appendChild(segDiv)
		})
	})
}
