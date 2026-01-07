
import { reactive, effect } from '../src/index'
import { enableIntrospection, getDependencyGraph, getMutationHistory, snapshot, ReactiveErrorCode } from '../src/introspection'
import { ReactiveError } from '../src/reactive/types'

describe('Introspection API', () => {
    beforeEach(() => {
        enableIntrospection({ historySize: 10 })
    })

    test('captures mutation history', async () => {
        const state = reactive({ count: 0 })
        
        effect(() => {
            const _ = state.count
        })

        state.count++
        
        const history = getMutationHistory()
        expect(history.length).toBeGreaterThan(0)
        expect(history[history.length - 1].prop).toBe('count')
        expect(history[history.length - 1].type).toBe('set')
    })

    test('captures dependency graph', () => {
        const state = reactive({ value: 'hello' })
        let captured: string
        
        const formatter = effect(() => {
            captured = state.value.toUpperCase()
        })
        
        const graph = getDependencyGraph()
        const edge = graph.edges.find(e => e.type === 'dependency')
        
        expect(edge).toBeDefined()
        // We expect an edge from effect -> object state
        // Note: graph structure details depend on debug.ts implementation
    })

    test('throws structured errors for cycles', () => {
        const a = reactive({ val: 0 })
        const b = reactive({ val: 0 })
        
        expect(() => {
            effect(() => {
                b.val = a.val + 1
            })
            effect(() => {
                a.val = b.val + 1
            })
        }).toThrow(ReactiveError)
        
        try {
            // Reset for inspection
            const x = reactive({ val: 0 })
            const y = reactive({ val: 0 })
             effect(() => {
                y.val = x.val + 1
            })
            effect(() => {
                x.val = y.val + 1
            })
        } catch (e: any) {
            expect(e).toBeInstanceOf(ReactiveError)
            expect(e.debugInfo).toBeDefined()
            // It might be CycleDetected or MaxReactionExceeded depending on how it's caught
            // But we specifically want to test structured error presence
            expect(e.debugInfo.code).toBeDefined()
        }
    })
})
