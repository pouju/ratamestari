import { z } from 'zod'
import { courseProblemTexts } from '@ratamestari/agent'
import type { Course, PaperChoice } from '@ratamestari/engine'
import { descriptionText, type ControlDescription, type DescriptionSheet } from '@ratamestari/iof'
import {
  ageClassSchema,
  eventLevelSchema,
  formatSchema,
  paperSizeSchema,
  PRINT_SCALE,
  printScaleSchema,
  type PrintScaleChoice,
  sexSchema,
  skillLetterSchema,
  type CourseRequest,
} from '@ratamestari/rules'
import { EVENT_LEVEL_LABELS, FORMAT_LABELS } from './course-labels'
import type { DescriptionBox } from './description-box'
import { formatDuration, formatKilometers, formatMeters } from './format'

const paperChoiceSchema = z.union([z.literal('auto'), paperSizeSchema])

interface Props {
  request: CourseRequest
  onRequestChange: (request: CourseRequest) => void
  hasCentre: boolean
  isPickingCentre: boolean
  onPickCentre: () => void
  canGenerate: boolean
  paceText: string
  onPaceTextChange: (text: string) => void
  isPaceValid: boolean
  isGenerating: boolean
  seed: number
  onGenerate: (seed: number) => void
  course: Course | null
  descriptionBox: DescriptionBox | null
  onExportXml: () => void
  paper: PaperChoice
  onPaperChange: (paper: PaperChoice) => void
  printScale: PrintScaleChoice
  onPrintScaleChange: (scale: PrintScaleChoice) => void
}

export function CoursePanel({
  request,
  onRequestChange,
  hasCentre,
  isPickingCentre,
  onPickCentre,
  canGenerate,
  paceText,
  onPaceTextChange,
  isPaceValid,
  isGenerating,
  seed,
  onGenerate,
  course,
  descriptionBox,
  onExportXml,
  paper,
  onPaperChange,
  printScale,
  onPrintScaleChange,
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
      <label className="pace">
        Winner's pace at full speed{' '}
        <input
          value={paceText}
          onChange={e => onPaceTextChange(e.target.value)}
          size={5}
          aria-invalid={!isPaceValid}
        />{' '}
        min/km
      </label>
      <label className="pace">
        Paper{' '}
        <select
          value={paper}
          onChange={e => onPaperChange(paperChoiceSchema.parse(e.target.value))}
        >
          <option value="auto">Automatic (A4, A3 if needed)</option>
          {paperSizeSchema.options.map(size => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </label>
      <label className="pace">
        Scale{' '}
        <select
          value={printScale}
          onChange={e =>
            onPrintScaleChange(
              e.target.value === 'auto' ? 'auto' : printScaleSchema.parse(Number(e.target.value)),
            )
          }
        >
          <option value="auto">
            Automatic (1:{PRINT_SCALE.defaultByFormat[request.format].toLocaleString('fi')})
          </option>
          {[...printScaleSchema.values].map(scale => (
            <option key={scale} value={scale}>
              1:{scale.toLocaleString('fi')}
            </option>
          ))}
        </select>
      </label>
      {!isPaceValid && <p className="error">Write the pace as minutes:seconds, e.g. 5:00.</p>}
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
      {descriptionBox && <DescriptionList sheet={descriptionBox.sheet} />}
      {course && (
        <div className="buttons">
          <button type="button" disabled={course.lengthMeters === null} onClick={onExportXml}>
            Export IOF XML
          </button>
        </div>
      )}
      {course && (
        <p className="note">
          IOF XML 3.0 opens in OCAD, Condes and Purple Pen. The file is saved on this computer.
        </p>
      )}
    </section>
  )
}

function CourseSummary({ course }: { course: Course }) {
  const problemTexts = courseProblemTexts(course)
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
      <dt>Rule checks</dt>
      <dd>{problemTexts.length === 0 ? 'No problems found' : problemTexts.join(', ')}</dd>
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
