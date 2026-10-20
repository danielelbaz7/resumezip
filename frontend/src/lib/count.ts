/** A number and the word for that many: "1 resume", "3 resumes". */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
