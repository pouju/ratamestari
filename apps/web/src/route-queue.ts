export type RouteJobPriority = 'preview' | 'selected' | 'course'

const MOST_URGENT_FIRST: readonly RouteJobPriority[] = ['preview', 'selected', 'course']

export const SUPERSEDED = Symbol('superseded')
export type Superseded = typeof SUPERSEDED

interface WaitingJob {
  readonly slot: string
  readonly priority: RouteJobPriority
  readonly run: () => Promise<unknown>
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
}

export interface RouteQueue {
  request<T>(
    slot: string,
    priority: RouteJobPriority,
    run: () => Promise<T>,
  ): Promise<T | Superseded>
  cancel(priority: RouteJobPriority): void
}

// The worker finds one route at a time, and a long leg takes up to a second. So only one request
// is sent at a time: a newer request for the same slot replaces one still waiting, and the most
// urgent kind goes first, so the pointer's preview never waits behind a whole course.
export function createRouteQueue(): RouteQueue {
  const waiting: WaitingJob[] = []
  let isRunning = false

  const runNext = () => {
    if (isRunning) return
    const index = MOST_URGENT_FIRST.map(priority =>
      waiting.findIndex(job => job.priority === priority),
    ).find(i => i >= 0)
    if (index === undefined) return
    const [job] = waiting.splice(index, 1)
    isRunning = true
    job!
      .run()
      .then(job!.resolve, job!.reject)
      .finally(() => {
        isRunning = false
        runNext()
      })
  }

  const removeWhere = (matches: (job: WaitingJob) => boolean) => {
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (matches(waiting[i]!)) waiting.splice(i, 1)[0]!.resolve(SUPERSEDED)
    }
  }

  return {
    request<T>(slot: string, priority: RouteJobPriority, run: () => Promise<T>) {
      return new Promise<T | Superseded>((resolve, reject) => {
        removeWhere(job => job.slot === slot)
        waiting.push({ slot, priority, run, resolve: resolve as (value: unknown) => void, reject })
        runNext()
      })
    },
    cancel(priority: RouteJobPriority) {
      removeWhere(job => job.priority === priority)
    },
  }
}
