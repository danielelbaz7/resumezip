/** A plain object, as read from saved data or a file: not null, not an array. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
