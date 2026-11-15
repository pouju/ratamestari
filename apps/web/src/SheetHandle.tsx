import { useRef, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import { useMessages } from './i18n'

export type SheetSize = 'peek' | 'half' | 'full'

const SHEET_SHARE_OF_SCREEN: Readonly<Record<SheetSize, number>> = {
  peek: 0.36,
  half: 0.6,
  full: 0.92,
}
const SIZES: readonly SheetSize[] = ['peek', 'half', 'full']
const TAP_TOLERANCE_PIXELS = 6

// While the handle is dragged, the sheet follows the finger without its size transition.
export const sheetStyle = (size: SheetSize, draggedHeight: number | null = null): CSSProperties =>
  ({
    '--sheet-height': `${SHEET_SHARE_OF_SCREEN[size] * 100}dvh`,
    ...(draggedHeight !== null && { height: `${draggedHeight}px`, transition: 'none' }),
  }) as CSSProperties

export const atLeastHalf = (size: SheetSize): SheetSize => (size === 'peek' ? 'half' : size)

function nearestSize(share: number): SheetSize {
  const distance = (size: SheetSize) => Math.abs(SHEET_SHARE_OF_SCREEN[size] - share)
  return SIZES.reduce((best, size) => (distance(size) < distance(best) ? size : best))
}

interface Props {
  size: SheetSize
  onSizeChange: (size: SheetSize) => void
  // The sheet's height in pixels while dragged, and null when the drag ends.
  onDrag: (height: number | null) => void
  sheet: RefObject<HTMLElement | null>
}

// Shown only on narrow screens, where the side panel becomes a sheet over the map.
export function SheetHandle({ size, onSizeChange, onDrag, sheet }: Props) {
  const m = useMessages().workspace
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)
  const wasDragged = useRef(false)

  function start(event: PointerEvent<HTMLButtonElement>) {
    const element = sheet.current
    if (!element) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      startY: event.clientY,
      startHeight: element.getBoundingClientRect().height,
      moved: false,
    }
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const element = sheet.current
    const current = drag.current
    if (!element || !current) return
    const offset = current.startY - event.clientY
    if (Math.abs(offset) > TAP_TOLERANCE_PIXELS) current.moved = true
    if (current.moved) onDrag(Math.max(0, current.startHeight + offset))
  }

  function end() {
    const element = sheet.current
    const current = drag.current
    drag.current = null
    if (!element || !current) return
    wasDragged.current = current.moved
    if (!current.moved) return
    const share = element.getBoundingClientRect().height / window.innerHeight
    onDrag(null)
    onSizeChange(nearestSize(share))
  }

  return (
    <button
      type="button"
      className="sheet-handle"
      aria-label={size === 'full' ? m.showLess : m.showMore}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={() => {
        if (wasDragged.current) {
          wasDragged.current = false
          return
        }
        onSizeChange(SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]!)
      }}
    >
      <span aria-hidden="true" />
    </button>
  )
}
