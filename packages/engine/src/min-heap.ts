const INITIAL_CAPACITY = 1024

// Typed arrays and in-place swaps: routing pushes and pops millions of cells, so nothing is
// allocated per operation.
export class MinHeap {
  private items = new Int32Array(INITIAL_CAPACITY)
  private priorities = new Float64Array(INITIAL_CAPACITY)
  private length = 0

  get size(): number {
    return this.length
  }

  push(item: number, priority: number) {
    if (this.length === this.items.length) this.grow()
    this.items[this.length] = item
    this.priorities[this.length] = priority
    this.siftUp(this.length)
    this.length++
  }

  pop(): number | undefined {
    if (this.length === 0) return undefined
    const top = this.items[0]
    this.length--
    if (this.length > 0) {
      this.items[0] = this.items[this.length]!
      this.priorities[0] = this.priorities[this.length]!
      this.siftDown(0)
    }
    return top
  }

  private grow() {
    const items = new Int32Array(this.items.length * 2)
    items.set(this.items)
    this.items = items
    const priorities = new Float64Array(this.priorities.length * 2)
    priorities.set(this.priorities)
    this.priorities = priorities
  }

  private siftUp(index: number) {
    let child = index
    while (child > 0) {
      const parent = (child - 1) >> 1
      if (this.priorities[parent]! <= this.priorities[child]!) return
      this.swap(parent, child)
      child = parent
    }
  }

  private siftDown(index: number) {
    let parent = index
    for (;;) {
      const left = 2 * parent + 1
      const right = left + 1
      let smallest = parent
      if (left < this.length && this.priorities[left]! < this.priorities[smallest]!) {
        smallest = left
      }
      if (right < this.length && this.priorities[right]! < this.priorities[smallest]!) {
        smallest = right
      }
      if (smallest === parent) return
      this.swap(parent, smallest)
      parent = smallest
    }
  }

  private swap(a: number, b: number) {
    const item = this.items[a]!
    this.items[a] = this.items[b]!
    this.items[b] = item
    const priority = this.priorities[a]!
    this.priorities[a] = this.priorities[b]!
    this.priorities[b] = priority
  }
}
