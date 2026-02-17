export interface ArrayDiffResult<T> {
	indexA: number
	indexB: number
	sliceA: T[]
	sliceB: T[]
}

/** Max edit distance before bailing out to a single "replace all" patch */
const BAILOUT_D = 256

/**
 * Myers' diff producing grouped patches: `{indexA, indexB, sliceA, sliceB}[]`.
 * - O(N) for identical or prefix/suffix-only differences
 * - O(ND) for small D, with a hard bailout at D=BAILOUT_D → single replacement patch
 */
export function arrayDiff<T>(A: readonly T[], B: readonly T[]): ArrayDiffResult<T>[] {
	let start = 0
	let endA = A.length
	let endB = B.length

	// Trim common prefix
	while (start < endA && start < endB && A[start] === B[start]) start++
	// Trim common suffix
	while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
		endA--
		endB--
	}

	const lenA = endA - start
	const lenB = endB - start

	if (lenA === 0 && lenB === 0) return []
	if (lenA === 0)
		return [{ indexA: start, indexB: start, sliceA: [], sliceB: B.slice(start, endB) }]
	if (lenB === 0)
		return [{ indexA: start, indexB: start, sliceA: A.slice(start, endA), sliceB: [] }]

	// Myers with bailout
	const maxD = Math.min(lenA + lenB, BAILOUT_D)
	const vSize = 2 * maxD + 1
	const vOffset = maxD
	const V = new Int32Array(vSize)
	V[vOffset + 1] = 0
	const history: Int32Array[] = []

	for (let d = 0; d <= maxD; d++) {
		for (let k = -d; k <= d; k += 2) {
			let x: number
			if (k === -d || (k !== d && V[vOffset + k - 1] < V[vOffset + k + 1])) {
				x = V[vOffset + k + 1]
			} else {
				x = V[vOffset + k - 1] + 1
			}
			let y = x - k
			while (x < lenA && y < lenB && A[start + x] === B[start + y]) {
				x++
				y++
			}
			V[vOffset + k] = x
			if (x >= lenA && y >= lenB) return buildPatches(history, A, B, start, x, y, d, k, vOffset)
		}
		history.push(new Int32Array(V))
	}

	// Bailout: too many differences
	return [
		{ indexA: start, indexB: start, sliceA: A.slice(start, endA), sliceB: B.slice(start, endB) },
	]
}

function buildPatches<T>(
	history: Int32Array[],
	A: readonly T[],
	B: readonly T[],
	offset: number,
	finalX: number,
	finalY: number,
	finalD: number,
	finalK: number,
	vOffset: number
): ArrayDiffResult<T>[] {
	// Backtrack from (finalX, finalY) at step finalD to step 0, collecting ops in reverse
	const ops: (0 | 1 | 2)[] = [] // 0=eq, 1=ins, 2=del
	let x = finalX
	let y = finalY
	let k = finalK

	for (let d = finalD; d > 0; d--) {
		const prev = history[d - 1]
		let prevK: number
		let down: boolean
		if (k === -d) {
			prevK = k + 1
			down = true
		} else if (k === d) {
			prevK = k - 1
			down = false
		} else if (prev[vOffset + k - 1] < prev[vOffset + k + 1]) {
			prevK = k + 1
			down = true
		} else {
			prevK = k - 1
			down = false
		}

		const prevXEnd = prev[vOffset + prevK]
		const prevYEnd = prevXEnd - prevK
		const xStart = down ? prevXEnd : prevXEnd + 1
		const yStart = down ? prevYEnd + 1 : prevXEnd + 1 - k

		// Diagonal matches (pushed in reverse)
		while (x > xStart && y > yStart) {
			ops.push(0)
			x--
			y--
		}
		// The edit step
		if (down) {
			ops.push(1) // ins
			y--
		} else {
			ops.push(2) // del
			x--
		}
		k = prevK
	}

	// Walk ops forward (they were pushed in reverse), grouping contiguous edits
	const patches: ArrayDiffResult<T>[] = []
	let currA = offset
	let currB = offset
	let sliceA: T[] = []
	let sliceB: T[] = []
	let patchA = -1
	let patchB = -1

	const flush = () => {
		if (patchA !== -1) {
			patches.push({ indexA: patchA, indexB: patchB, sliceA, sliceB })
			sliceA = []
			sliceB = []
			patchA = -1
		}
	}

	for (let i = ops.length - 1; i >= 0; i--) {
		const op = ops[i]
		if (op === 0) {
			flush()
			currA++
			currB++
		} else if (op === 1) {
			if (patchA === -1) {
				patchA = currA
				patchB = currB
			}
			sliceB.push(B[currB++])
		} else {
			if (patchA === -1) {
				patchA = currA
				patchB = currB
			}
			sliceA.push(A[currA++])
		}
	}
	flush()
	return patches
}
