// Augment Array.isArray to properly handle readonly arrays in type narrowing
interface ArrayConstructor {
	/**
	 * Determines whether an object is an array.
	 * @param arg Any value to test.
	 * @returns True if the value is an array (mutable or readonly), false otherwise.
	 */
	isArray(arg: any): arg is any[] | readonly any[]
}
