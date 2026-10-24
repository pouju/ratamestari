import { describeFinding, type Severity } from '@ratamestari/agent'
import type { Course } from '@ratamestari/engine'
import {
  ageClassSchema,
  eventLevelSchema,
  formatSchema,
  sexSchema,
  skillLetterSchema,
  type CourseRequest,
} from '@ratamestari/rules'
import { useState } from 'react'
import { offeredAgeClasses, withOfferedClass } from './class-choice'
import { useFormat, useMessages } from './i18n'
import { ScoreBreakdown } from './ScoreBreakdown'
import { PanelLine } from './WorkspaceStart'

interface Props {
  request: CourseRequest
  onRequestChange: (request: CourseRequest) => void
  isAssistantOn: boolean
  hasCentre: boolean
  isPickingCentre: boolean
  onMoveCentre: () => void
  canSetCourse: boolean
  isGenerating: boolean
  onSetCourse: () => void
  onStop: () => void
  onTryAnother: () => void
  course: Course | null
  isEditing: boolean
  isPreparingPdf: boolean
  onDownloadPdf: () => void
  onDownloadXml: () => void
  onFixControl: (controlNumber: number) => void
}

export function CoursePanel(props: Props) {
  const { hasCentre, isPickingCentre, onMoveCentre, course } = props
  const m = useMessages()
  const isMeasured = course !== null && course.lengthMeters !== null

  return (
    <>
      {hasCentre && !isPickingCentre ? (
        <PanelLine
          label={m.course.centreLine}
          value={m.course.centreChosen}
          action={{ label: m.course.change, onClick: onMoveCentre }}
        />
      ) : (
        <section className="centre-step" aria-labelledby="centre-step-title">
          <span className="panel-line-label">{m.course.centreLine}</span>
          <h2 id="centre-step-title">{m.course.centreQuestion}</h2>
          <p>{m.course.centreHint}</p>
        </section>
      )}

      {hasCentre && !isPickingCentre && (
        <>
          <RequestSentence request={props.request} onRequestChange={props.onRequestChange} />
          {course && <CourseFigures course={course} />}
          {course && isMeasured && (
            <Findings course={course} isEditing={props.isEditing} onFix={props.onFixControl} />
          )}
          {course && isMeasured && <ScoreBreakdown course={course} />}
          <CourseActions {...props} isMeasured={isMeasured} />
        </>
      )}
    </>
  )
}

const hasCoarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

const classValue = (sex: CourseRequest['sex'], age: CourseRequest['ageClass']) => `${sex}${age}`

function RequestSentence({ request, onRequestChange }: Pick<Props, 'request' | 'onRequestChange'>) {
  const m = useMessages().course
  const [replacedClass, setReplacedClass] = useState<string | null>(null)
  const change = (fields: Partial<CourseRequest>) => {
    const choice = withOfferedClass({ ...request, ...fields })
    setReplacedClass(
      choice.replacedAgeClass === null
        ? null
        : m.classReplaced(
            m.eventLevels[choice.request.eventLevel],
            m.formats[choice.request.format],
            classValue(choice.request.sex, choice.replacedAgeClass),
            classValue(choice.request.sex, choice.request.ageClass),
          ),
    )
    onRequestChange(choice.request)
  }
  const ages = offeredAgeClasses(request)

  return (
    <section className="request" aria-labelledby="request-title">
      <span id="request-title" className="panel-line-label">
        {m.courseLine}
      </span>
      <p className="request-sentence">
        <select
          className="request-token"
          aria-label={m.eventLevel}
          value={request.eventLevel}
          onChange={e => change({ eventLevel: eventLevelSchema.parse(e.target.value) })}
        >
          {eventLevelSchema.options.map(level => (
            <option key={level} value={level}>
              {m.eventLevels[level]}
            </option>
          ))}
        </select>{' '}
        <select
          className="request-token"
          aria-label={m.distance}
          value={request.format}
          onChange={e => change({ format: formatSchema.parse(e.target.value) })}
        >
          {formatSchema.options.map(format => (
            <option key={format} value={format}>
              {m.formats[format]}
            </option>
          ))}
        </select>{' '}
        {m.forClass}{' '}
        <select
          className="request-token"
          aria-label={m.className}
          value={classValue(request.sex, request.ageClass)}
          onChange={e => {
            const sex = sexSchema.parse(e.target.value.slice(0, 1))
            change({ sex, ageClass: ageClassSchema.parse(Number(e.target.value.slice(1))) })
          }}
        >
          {sexSchema.options.map(sex => (
            <optgroup key={sex} label={m.sexes[sex]}>
              {ages.map(age => (
                <option key={age} value={classValue(sex, age)}>
                  {classValue(sex, age)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {m.beforeSkillLevel}
        <select
          className="request-token"
          aria-label={m.skillLevel}
          value={request.skillLetter}
          onChange={e => change({ skillLetter: skillLetterSchema.parse(e.target.value) })}
        >
          {skillLetterSchema.options.map(letter => (
            <option key={letter} value={letter}>
              {m.skillLevelOption(letter)}
            </option>
          ))}
        </select>
      </p>
      <p className="request-note">{m.skillLevels[request.skillLetter]}</p>
      {replacedClass && (
        <p className="request-note" role="status">
          {replacedClass}
        </p>
      )}
    </section>
  )
}

function CourseFigures({ course }: { course: Course }) {
  const m = useMessages().course
  const format = useFormat()
  return (
    <dl className="course-figures">
      <div>
        <dt>{m.length}</dt>
        <dd>
          {course.lengthMeters === null ? m.measuring : format.kilometres(course.lengthMeters)}
        </dd>
      </div>
      <div>
        <dt>{m.climb}</dt>
        <dd>{course.climbMeters === null ? m.measuring : format.metres(course.climbMeters)}</dd>
      </div>
      <div>
        <dt>{m.winningTime}</dt>
        <dd>{m.minutes(Math.round(course.estimatedSeconds / 60))}</dd>
        <dd className="course-figures-note">
          {m.target(m.minutes(Math.round(course.targetSeconds / 60)))}
        </dd>
      </div>
      <div>
        <dt>{m.controls}</dt>
        <dd>{course.controls.length}</dd>
      </div>
    </dl>
  )
}

function Findings({
  course,
  isEditing,
  onFix,
}: {
  course: Course
  isEditing: boolean
  onFix: (controlNumber: number) => void
}) {
  const m = useMessages().course
  const findings = course.findings.map(finding => describeFinding(finding, course.controls.length))

  return (
    <section className="findings" aria-labelledby="findings-title">
      <h2 id="findings-title">
        {findings.length === 0 ? m.noFindings : m.findingCount(findings.length)}
      </h2>
      {findings.length > 0 && (
        <ul>
          {findings.map(({ fixableControl, severity, text, basis }, i) => (
            <li key={i}>
              <SeverityMark severity={severity} label={m.severities[severity]} />
              <div className="findings-text">
                <span>{text}</span>
                <span className="findings-basis">{basis}</span>
              </div>
              {fixableControl !== null && (
                <button
                  type="button"
                  className="findings-fix"
                  disabled={isEditing}
                  aria-label={m.fixControl(fixableControl)}
                  onClick={() => onFix(fixableControl)}
                >
                  {m.fix}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="findings-hint">{hasCoarsePointer() ? m.dragHintTouch : m.dragHint}</p>
    </section>
  )
}

function SeverityMark({ severity, label }: { severity: Severity; label: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" role="img" aria-label={label}>
      {severity === 'note' ? (
        <circle cx="9" cy="9" r="7" fill="none" stroke="var(--colour-ink-soft)" strokeWidth="2" />
      ) : (
        <polygon
          points="9,1 17,16 1,16"
          fill={severity === 'error' ? 'var(--colour-contour-brown)' : 'none'}
          stroke="var(--colour-contour-brown)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function CourseActions({
  course,
  canSetCourse,
  isGenerating,
  isEditing,
  isPreparingPdf,
  isMeasured,
  isAssistantOn,
  onSetCourse,
  onStop,
  onTryAnother,
  onDownloadPdf,
  onDownloadXml,
}: Props & { isMeasured: boolean }) {
  const m = useMessages().course

  if (isGenerating) {
    return (
      <div className={isAssistantOn ? 'course-actions is-quiet' : 'course-actions'}>
        <div className="course-actions-row">
          <button type="button" className="course-primary" onClick={onStop}>
            {m.stop}
          </button>
          <span className="course-actions-status" role="status">
            {m.setting}
          </span>
        </div>
        <p className="course-actions-note">{m.stopHint}</p>
      </div>
    )
  }

  if (!course) {
    return (
      <div className={isAssistantOn ? 'course-actions is-quiet' : 'course-actions'}>
        <button
          type="button"
          className="course-primary"
          disabled={!canSetCourse}
          onClick={onSetCourse}
        >
          {m.setCourse}
        </button>
      </div>
    )
  }

  return (
    <div className={isAssistantOn ? 'course-actions is-quiet' : 'course-actions'}>
      <div className="course-actions-row">
        <button
          type="button"
          className="course-primary"
          disabled={!isMeasured || isPreparingPdf}
          onClick={onDownloadPdf}
        >
          {isPreparingPdf ? m.preparingPdf : m.downloadPdf}
        </button>
        <button
          type="button"
          className="course-secondary"
          disabled={!isMeasured}
          onClick={onDownloadXml}
        >
          {m.downloadXml}
        </button>
        <button
          type="button"
          className="course-secondary course-another"
          disabled={!canSetCourse || isEditing}
          onClick={onTryAnother}
        >
          {m.tryAnother}
        </button>
      </div>
      <p className="course-actions-note">{m.exportNote}</p>
    </div>
  )
}
