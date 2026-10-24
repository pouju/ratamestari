import type { Course } from '@ratamestari/engine'
import { ControlPreviewRoutes } from './CourseRoutesPanel'
import { hasCoarsePointer } from './CoursePanel'
import { useMessages } from './i18n'
import { stopName, type ControlPreview } from './leg-routes'
import { isControlStop } from './set-by-hand'

interface Props {
  course: Course | null
  selectedStop: number | null
  preview: ControlPreview | null
  canUndo: boolean
  isEditing: boolean
  onDelete: (stop: number) => void
  onUndo: () => void
  onDone: () => void
}

export function SetByHandPanel({
  course,
  selectedStop,
  preview,
  canUndo,
  isEditing,
  onDelete,
  onUndo,
  onDone,
}: Props) {
  const m = useMessages().setByHand
  const isTouch = hasCoarsePointer()
  const nextControl = (course?.controls.length ?? 0) + 1
  const instruction = !course
    ? isTouch
      ? m.placeStartTouch
      : m.placeStart
    : isTouch
      ? m.placeNextTouch(nextControl)
      : m.placeNext(nextControl)
  const selected = course && selectedStop !== null ? stopName(course, selectedStop) : null

  return (
    <section className="leg-view" aria-labelledby="set-by-hand-title">
      <div>
        <h2 id="set-by-hand-title">{m.title}</h2>
        <p className="leg-view-soft" aria-live="polite">
          {instruction}
        </p>
      </div>
      {preview && selected === null && <ControlPreviewRoutes preview={preview} />}
      {selected !== null && (
        <div>
          <p aria-live="polite">
            {m.selected(selected)} {typeof selected === 'number' && m.selectedControlHint}
          </p>
          {isControlStop(course, selectedStop) && (
            <>
              <button
                type="button"
                className="course-secondary"
                disabled={isEditing}
                onClick={() => onDelete(selectedStop)}
              >
                {m.deleteControl(selectedStop)}
              </button>
              {!isTouch && <p className="leg-view-soft">{m.deleteKeyHint}</p>}
            </>
          )}
        </div>
      )}
      <p className="leg-view-soft">{m.snapNote}</p>
      <div className="course-actions-row">
        <button
          type="button"
          className="course-secondary"
          disabled={!canUndo || isEditing}
          onClick={onUndo}
        >
          {m.undo}
        </button>
        <button type="button" className="course-secondary" onClick={onDone}>
          {m.done}
        </button>
      </div>
    </section>
  )
}
