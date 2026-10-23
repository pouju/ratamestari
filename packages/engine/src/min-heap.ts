export class MinHeap {
  private items: number[] = []
  private priorities: number[] = []

  get size(): number {
    return this.items.length
  }

  push(item: number, priority: number) {
    this.items.push(item)
    this.priorities.push(priority)
    this.siftUp(this.items.length - 1)
  }

  pop(): number | undefined {
    const top = this.items[0]
    const lastItem = this.items.pop()
    const lastPriority = this.priorities.pop()
    if (this.items.length > 0 && lastItem !== undefined && lastPriority !== undefined) {
      this.items[0] = lastItem
      this.priorities[0] = lastPriority
      this.siftDown(0)
    }
    return top
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
      if (left < this.items.length && this.priorities[left]! < this.priorities[smallest]!) {
        smallest = left
      }
      if (right < this.items.length && this.priorities[right]! < this.priorities[smallest]!) {
        smallest = right
      }
      if (smallest === parent) return
      this.swap(parent, smallest)
      parent = smallest
    }
  }

  private swap(a: number, b: number) {
    ;[this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!]
    ;[this.priorities[a], this.priorities[b]] = [this.priorities[b]!, this.priorities[a]!]
  }
}
