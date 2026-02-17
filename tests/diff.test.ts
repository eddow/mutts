import { describe, expect, it } from 'vitest'
import { arrayDiff } from '../src/diff'

describe('arrayDiff', () => {
	// --- basic cases ---

	it('identical arrays', () => {
		expect(arrayDiff([1, 2, 3], [1, 2, 3])).toEqual([])
	})

	it('completely different arrays', () => {
		expect(arrayDiff([1, 2, 3], [4, 5, 6])).toEqual([
			{ indexA: 0, indexB: 0, sliceA: [1, 2, 3], sliceB: [4, 5, 6] },
		])
	})

	it('simple insertion', () => {
		expect(arrayDiff([1, 3], [1, 2, 3])).toEqual([
			{ indexA: 1, indexB: 1, sliceA: [], sliceB: [2] },
		])
	})

	it('simple deletion', () => {
		expect(arrayDiff([1, 2, 3], [1, 3])).toEqual([
			{ indexA: 1, indexB: 1, sliceA: [2], sliceB: [] },
		])
	})

	it('replacement in middle', () => {
		expect(arrayDiff([1, 2, 3], [1, 4, 3])).toEqual([
			{ indexA: 1, indexB: 1, sliceA: [2], sliceB: [4] },
		])
	})

	it('prefix and suffix match with complex middle', () => {
		expect(arrayDiff(['A', 'B', 'C', 'D', 'E'], ['A', 'B', 'X', 'Y', 'E'])).toEqual([
			{ indexA: 2, indexB: 2, sliceA: ['C', 'D'], sliceB: ['X', 'Y'] },
		])
	})

	it('groups contiguous changes', () => {
		const result = arrayDiff(['A', 'B', 'C', 'D', 'E'], ['A', 'X', 'Y', 'E'])
		expect(result).toHaveLength(1)
		expect(result[0].indexA).toBe(1)
		expect(result[0].sliceA).toEqual(['B', 'C', 'D'])
		expect(result[0].sliceB).toEqual(['X', 'Y'])
	})

	it('mixed types via generic', () => {
		expect(arrayDiff([1, 'a', true], [1, 'b', true])).toEqual([
			{ indexA: 1, indexB: 1, sliceA: ['a'], sliceB: ['b'] },
		])
	})

	// --- edge cases ---

	it('both empty', () => {
		expect(arrayDiff([], [])).toEqual([])
	})

	it('A empty, B non-empty', () => {
		expect(arrayDiff([], [1, 2])).toEqual([{ indexA: 0, indexB: 0, sliceA: [], sliceB: [1, 2] }])
	})

	it('A non-empty, B empty', () => {
		expect(arrayDiff([1, 2], [])).toEqual([{ indexA: 0, indexB: 0, sliceA: [1, 2], sliceB: [] }])
	})

	it('single element — same', () => {
		expect(arrayDiff([1], [1])).toEqual([])
	})

	it('single element — different', () => {
		expect(arrayDiff([1], [2])).toEqual([{ indexA: 0, indexB: 0, sliceA: [1], sliceB: [2] }])
	})

	it('multiple disjoint patches', () => {
		// A: [A, B, C, D, E] → B: [A, X, C, Y, E]
		const result = arrayDiff(['A', 'B', 'C', 'D', 'E'], ['A', 'X', 'C', 'Y', 'E'])
		expect(result).toEqual([
			{ indexA: 1, indexB: 1, sliceA: ['B'], sliceB: ['X'] },
			{ indexA: 3, indexB: 3, sliceA: ['D'], sliceB: ['Y'] },
		])
	})

	it('full reversal', () => {
		const result = arrayDiff([1, 2, 3], [3, 2, 1])
		// Myers won't detect "move", just edits around the shared '2'
		expect(result.length).toBeGreaterThanOrEqual(1)
		// Verify patches are consistent: applying them reconstructs B
		const rebuilt = applyPatches([1, 2, 3], result, [3, 2, 1])
		expect(rebuilt).toEqual([3, 2, 1])
	})

	it('append only', () => {
		expect(arrayDiff([1, 2], [1, 2, 3, 4])).toEqual([
			{ indexA: 2, indexB: 2, sliceA: [], sliceB: [3, 4] },
		])
	})

	it('prepend only', () => {
		expect(arrayDiff([3, 4], [1, 2, 3, 4])).toEqual([
			{ indexA: 0, indexB: 0, sliceA: [], sliceB: [1, 2] },
		])
	})

	it('bailout on large completely-different arrays', () => {
		const A = Array.from({ length: 500 }, (_, i) => i)
		const B = Array.from({ length: 500 }, (_, i) => i + 1000)
		const result = arrayDiff(A, B)
		// Should bail out to single patch (D=1000 > BAILOUT_D=256)
		expect(result).toEqual([{ indexA: 0, indexB: 0, sliceA: A, sliceB: B }])
	})
})

/** Verify patch consistency: apply patches from A to get B */
function applyPatches<T>(
	A: T[],
	patches: { indexA: number; sliceA: T[]; sliceB: T[] }[],
	_B: T[]
): T[] {
	const result = [...A]
	let shift = 0
	for (const p of patches) {
		const idx = p.indexA + shift
		result.splice(idx, p.sliceA.length, ...p.sliceB)
		shift += p.sliceB.length - p.sliceA.length
	}
	return result
}
