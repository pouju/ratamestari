import type { Course } from '@ratamestari/engine'
import type { CourseRequest } from '@ratamestari/rules'
import type { CourseFit, DeducedClass } from './course-fit'
import { useFormat, useMessages } from './i18n'
import { PanelLine } from './WorkspaceStart'

const MISMATCH_WORTH_MENTIONING_METRES = 30

export interface CourseFileCheck {
  readonly fileName: string
  readonly courseNames: readonly string[]
  readonly selected: number
  readonly classFromName: boolean
  readonly deduced: DeducedClass | null
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

export function DeducedClassView({
  deduced,
  classFromName,
}: {
  deduced: DeducedClass
  classFromName: boolean
}) {
  const m = useMessages()
  const { best, alsoFits } = deduced
  const minutes = (value: number) => m.course.minutes(Math.round(value))
  const { minMinutes, maxMinutes } = best.target.winningTime
  const describe = (fit: CourseFit) => classSentence(m, fit.request)
  const range = m.check.minuteRange(Math.round(minMinutes), Math.round(maxMinutes))
  return (
    <section className="check-fit" aria-labelledby="check-fit-title">
      <span id="check-fit-title" className="panel-line-label">
        {m.check.fitsBest}
      </span>
      <p className="check-fit-sentence">{describe(best)}</p>
      <p className="request-note">
        {best.minutesOutsideRange === 0
          ? m.check.timeInside(minutes(best.estimatedMinutes), range)
          : m.check.timeOutside(
              minutes(best.estimatedMinutes),
              minutes(best.minutesOutsideRange),
              best.estimatedMinutes > maxMinutes,
              range,
            )}
      </p>
      <p className="request-note">
        {best.controlsOutsideDifficulty === 0
          ? m.check.difficultyFits
          : m.check.difficultyMisfits(best.controlsOutsideDifficulty)}
      </p>
      {alsoFits.length > 0 && (
        <p className="request-note">{m.check.alsoFits(alsoFits.map(describe))}</p>
      )}
      <p className="request-note">
        {classFromName ? m.check.classFromName : m.check.classFromCourse}
      </p>
    </section>
  )
}

function classSentence(m: ReturnType<typeof useMessages>, request: CourseRequest): string {
  return m.check.classSentence(
    m.course.eventLevels[request.eventLevel],
    m.course.formats[request.format],
    `${request.sex}${request.ageClass}`,
    request.skillLetter,
  )
}
