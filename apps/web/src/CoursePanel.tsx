import { describeFinding } from '@ratamestari/agent'
import type { Course } from '@ratamestari/engine'
import { descriptionText, type ControlDescription, type DescriptionSheet } from '@ratamestari/iof'
import {
  ageClassSchema,
  eventLevelSchema,
  formatSchema,
  sexSchema,
  skillLetterSchema,
  type CourseRequest,
} from '@ratamestari/rules'
import { EVENT_LEVEL_LABELS, FORMAT_LABELS } from './course-labels'
import type { DescriptionBox } from './description-box'
import { formatDuration, formatKilometers, formatMeters } from './format'
import { ScoreBreakdown } from './ScoreBreakdown'

interface Props {
  request: CourseRequest
  onRequestChange: (request: CourseRequest) => void
  hasCentre: boolean
  isPickingCentre: boolean
  onPickCentre: () => void
  canGenerate: boolean
  isGenerating: boolean
  seed: number
  onGenerate: (seed: number) => void
  course: Course | null
  descriptionBox: DescriptionBox | null
  onExportXml: () => void
  onPrintPdf: () => void
  onFixControl: (controlNumber: number) => void
  isEditing: boolean
  isPreparingPdf: boolean
}

export function CoursePanel({
  request,
  onRequestChange,
  hasCentre,
  isPickingCentre,
  onPickCentre,
  canGenerate,
  isGenerating,
  seed,
  onGenerate,
  course,
  descriptionBox,
  onExportXml,
  onPrintPdf,
  onFixControl,
  isEditing,
  isPreparingPdf,
}: Props) {
  const change = (fields: Partial<CourseRequest>) => onRequestChange({ ...request, ...fields })
  return (
    <section>
      <h2>Course</h2>
      <button type="button" onClick={onPickCentre} disabled={isPickingCentre}>
        {isPickingCentre
          ? 'Click the competition centre on the map…'
          : hasCentre
            ? 'Move competition centre'
            : 'Set competition centre'}
      </button>
      <div className="form">
        <select
          value={request.eventLevel}
          onChange={e => change({ eventLevel: eventLevelSchema.parse(e.target.value) })}
        >
          {eventLevelSchema.options.map(level => (
            <option key={level} value={level}>
              {EVENT_LEVEL_LABELS[level]}
            </option>
          ))}
        </select>
        <select
          value={request.format}
          onChange={e => change({ format: formatSchema.parse(e.target.value) })}
        >
          {formatSchema.options.map(format => (
            <option key={format} value={format}>
              {FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
        <span className="class-picker">
          <select
            value={request.sex}
            onChange={e => change({ sex: sexSchema.parse(e.target.value) })}
          >
            {sexSchema.options.map(sex => (
              <option key={sex}>{sex}</option>
            ))}
          </select>
          <select
            value={request.ageClass}
            onChange={e => change({ ageClass: ageClassSchema.parse(Number(e.target.value)) })}
          >
            {[...ageClassSchema.values].map(age => (
              <option key={age}>{age}</option>
            ))}
          </select>
          <select
            value={request.skillLetter}
            onChange={e => change({ skillLetter: skillLetterSchema.parse(e.target.value) })}
          >
            {skillLetterSchema.options.map(letter => (
              <option key={letter}>{letter}</option>
            ))}
          </select>
        </span>
      </div>
      <div className="buttons">
        <button type="button" disabled={!canGenerate} onClick={() => onGenerate(seed)}>
          {isGenerating ? 'Setting course…' : 'Generate'}
        </button>
        <button type="button" disabled={!canGenerate} onClick={() => onGenerate(seed + 1)}>
          Another option
        </button>
      </div>
      {!hasCentre && (
        <p className="note">Set the competition centre first. The finish goes there.</p>
      )}
      {course && <CourseSummary course={course} />}
      {course && course.lengthMeters !== null && <ScoreBreakdown course={course} />}
      {course && course.lengthMeters !== null && (
        <RuleChecks course={course} onFixControl={onFixControl} isEditing={isEditing} />
      )}
      {descriptionBox && <DescriptionList sheet={descriptionBox.sheet} />}
      {course && (
        <div className="buttons">
          <button
            type="button"
            disabled={course.lengthMeters === null || isPreparingPdf}
            onClick={onPrintPdf}
          >
            {isPreparingPdf ? 'Preparing PDF…' : 'Print PDF'}
          </button>
          <button type="button" disabled={course.lengthMeters === null} onClick={onExportXml}>
            Export IOF XML
          </button>
        </div>
      )}
      {course && (
        <p className="note">
          The PDF is the print page with the course and descriptions. IOF XML 3.0 opens in OCAD,
          Condes and Purple Pen. Files are saved on this computer.
        </p>
      )}
    </section>
  )
}

function CourseSummary({ course }: { course: Course }) {
  return (
    <dl>
      <dt>Controls</dt>
      <dd>{course.controls.length}</dd>
      <dt>Estimated winning time</dt>
      <dd>
        {formatDuration(course.estimatedSeconds)} (target {formatDuration(course.targetSeconds)})
      </dd>
      <dt>Course length (shortest route, LS 11.22)</dt>
      <dd>{course.lengthMeters === null ? 'measuring…' : formatKilometers(course.lengthMeters)}</dd>
      <dt>Climb</dt>
      <dd>{course.climbMeters === null ? 'measuring…' : formatMeters(course.climbMeters)}</dd>

      {course.printArea && (
        <>
          <dt>Paper</dt>
          <dd>
            {course.printArea.paper} {course.printArea.orientation}, 1:
            {course.printArea.scale.toLocaleString('fi')}
          </dd>
        </>
      )}
      <dt>Option</dt>
      <dd>Seed {course.seed}</dd>
    </dl>
  )
}

function DescriptionList({ sheet }: { sheet: DescriptionSheet }) {
  const text = (description: ControlDescription | null) =>
    description ? descriptionText(description) : 'Not describable'
  return (
    <>
      <h2>Control descriptions</h2>
      <ol className="descriptions">
        <li value={0}>Start: {text(sheet.start)}</li>
        {sheet.controls.map(control => (
          <li key={control.number} value={control.number}>
            {control.code} {text(control.description)}
          </li>
        ))}
      </ol>
      <p className="note">
        {sheet.finish.distanceMeters} m from the last control to the finish, taped route.
      </p>
    </>
  )
}

const SEVERITY_LABELS = { error: 'Error', warning: 'Warning', note: 'Note' } as const

function RuleChecks({
  course,
  onFixControl,
  isEditing,
}: {
  course: Course
  onFixControl: (controlNumber: number) => void
  isEditing: boolean
}) {
  const findings = course.findings.map(finding => describeFinding(finding, course.controls.length))
  return (
    <>
      <h2>Rule checks</h2>
      {findings.length === 0 ? (
        <p className="note">No problems found.</p>
      ) : (
        <ul className="findings">
          {findings.map(({ fixableControl, ...finding }, i) => (
            <li key={i} className={finding.severity}>
              <span className="severity">{SEVERITY_LABELS[finding.severity]}</span> {finding.text}
              <span className="basis"> ({finding.basis})</span>
              {fixableControl !== null && (
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => onFixControl(fixableControl)}
                >
                  Fix control {fixableControl}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="note">
        Drag a control or the start on the map to move it; the rules are checked again.
      </p>
    </>
  )
}
