// Simple nanoid-like function without the dependency
let counter = 0
export function nanoid(): string {
  return `${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 7)}`
}
