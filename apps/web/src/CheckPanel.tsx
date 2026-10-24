import type { Course } from '@ratamestari/engine'
import { useFormat, useMessages } from './i18n'
import { PanelLine } from './WorkspaceStart'

const MISMATCH_WORTH_MENTIONING_METRES = 30

export interface CourseFileCheck {
  readonly fileName: string
  readonly courseNames: readonly string[]
  readonly selected: number
  readonly hasGuessedClass: boolean
  readonly status: 'checking' | 'checked' | 'notOnMap'
  readonly fileLengthMeters: number | null
  readonly fileControlCount: number
  readonly groundMismatchMetres: number | null
}

interface HeaderProps {
  check: CourseFileCheck
  onSelect: (index: number) => void
  onClose: () => void
}

export function CheckHeader({ check, onSelect, onClose }: HeaderProps) {
  const m = useMessages().check
  return (
    <>
      <PanelLine
        label={m.fileLine}
        value={check.fileName}
        action={{ label: m.close, onClick: onClose }}
      />
      {check.courseNames.length > 1 && (
        <nav aria-label={m.coursesLabel} className="check-tabs">
          {check.courseNames.map((name, i) => (
            <button
              key={`${name}-${i}`}
              type="button"
              aria-current={i === check.selected ? 'page' : undefined}
              onClick={() => onSelect(i)}
            >
              {name}
            </button>
          ))}
        </nav>
      )}
      {check.status === 'checking' && <p className="note">{m.checking}</p>}
      {check.status === 'notOnMap' && <p className="error">{m.notOnMap}</p>}
    </>
  )
}

export function CheckComparison({ check, course }: { check: CourseFileCheck; course: Course }) {
  const m = useMessages()
  const format = useFormat()
  const mismatch = check.groundMismatchMetres
  const minutes = (seconds: number) => m.course.minutes(Math.round(seconds / 60))

  return (
    <>
      <table className="check-comparison">
        <thead>
          <tr>
            <td />
            <th scope="col">{m.check.yourFile}</th>
            <th scope="col">{m.check.measured}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{m.course.length}</th>
            <td>
              {check.fileLengthMeters === null
                ? m.check.notGiven
                : format.kilometres(check.fileLengthMeters)}
            </td>
            <td>
              {course.lengthMeters === null
                ? m.course.measuring
                : format.kilometres(course.lengthMeters)}
            </td>
          </tr>
          <tr>
            <th scope="row">{m.course.climb}</th>
            <td>{m.check.notGiven}</td>
            <td>
              {course.climbMeters === null ? m.course.measuring : format.metres(course.climbMeters)}
            </td>
          </tr>
          <tr>
            <th scope="row">{m.course.winningTime}</th>
            <td>{m.check.notGiven}</td>
            <td>
              {minutes(course.estimatedSeconds)}
              <span className="check-target">{m.course.target(minutes(course.targetSeconds))}</span>
            </td>
          </tr>
          <tr>
            <th scope="row">{m.course.controls}</th>
            <td>{check.fileControlCount}</td>
            <td>{course.controls.length}</td>
          </tr>
        </tbody>
      </table>
      {mismatch !== null && mismatch >= MISMATCH_WORTH_MENTIONING_METRES && (
        <p className="request-note">{m.check.mismatch(format.metres(mismatch))}</p>
      )}
      <p className="request-note">{m.check.descriptionsNote}</p>
    </>
  )
}

interface SuggestionProps {
  controlNumber: number
  isFound: boolean
  onAccept: () => void
  onDismiss: () => void
}

export function SuggestionBar({ controlNumber, isFound, onAccept, onDismiss }: SuggestionProps) {
  const m = useMessages().check
  return (
    <div className="suggestion" role="status">
      <p>{isFound ? m.suggestion(controlNumber) : m.noSuggestion(controlNumber)}</p>
      <div className="suggestion-actions">
        {isFound && (
          <button type="button" className="suggestion-accept" onClick={onAccept}>
            {m.moveHere}
          </button>
        )}
        <button type="button" className="suggestion-dismiss" onClick={onDismiss}>
          {isFound ? m.keepMine : m.close}
        </button>
      </div>
    </div>
  )
}
