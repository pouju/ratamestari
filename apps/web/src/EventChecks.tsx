import type { EventFinding, EventPlan } from '@ratamestari/engine'
import { citationText, controlSpacingForScale, EVENT_CHECKS } from '@ratamestari/rules'
import { FindingExplanation, SeverityMark } from './CoursePanel'
import { useFormat, useMessages } from './i18n'

interface Props {
  findings: readonly EventFinding[]
  event: EventPlan
  mapScale: number
}

// Findings that only show when the event's courses are seen together (D27).
export function EventChecks({ findings, event, mapScale }: Props) {
  const messages = useMessages()
  const m = messages.event.checks
  const format = useFormat()
  const spacing = controlSpacingForScale(mapScale)
  const codeOf = new Map(event.controls.map(control => [control.id, control.code]))
  const nameOf = new Map(event.courses.map(entry => [entry.id, entry.name]))

  const textOf = ({ kind, controlIds: [a, b], meters }: EventFinding) => {
    const codeA = codeOf.get(a) ?? 0
    const codeB = codeOf.get(b) ?? 0
    const metres = format.metres(meters)
    switch (kind) {
      case 'controlsTooClose':
        return m.texts.controlsTooClose(
          codeA,
          codeB,
          metres,
          format.metres(spacing.minStraightMeters),
        )
      case 'similarControlsClose':
        return m.texts.similarControlsClose(
          codeA,
          codeB,
          metres,
          format.metres(spacing.minStraightMetersForSimilarSites),
        )
      case 'similarCodesNear':
        return m.texts.similarCodesNear(codeA, codeB, metres)
      case 'legSharedByCourses':
        return m.texts.legSharedByCourses(codeA, codeB)
      case 'legRunBothWays':
        return m.texts.legRunBothWays(codeA, codeB)
    }
  }

  return (
    <section className="findings event-checks" aria-labelledby="event-checks-title">
      <h2 id="event-checks-title">{m.title(findings.length)}</h2>
      {findings.length > 0 && (
        <ul>
          {findings.map(finding => {
            const check = EVENT_CHECKS[finding.kind]
            const names = finding.courseIds.map(id => nameOf.get(id) ?? '').join(', ')
            return (
              <li key={`${finding.kind}-${finding.controlIds.join('-')}`}>
                <SeverityMark
                  severity={check.severity}
                  label={messages.course.severities[check.severity]}
                />
                <div className="findings-text">
                  <span>{textOf(finding)}</span>
                  <span className="findings-basis">
                    {[
                      m.courses(names, finding.courseIds.length),
                      citationText(check.sources),
                      ...(check.interpretation ? [m.ourReading] : []),
                    ].join(' · ')}
                  </span>
                  <FindingExplanation explanation={m.explanations[finding.kind]} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// One IOF XML file with all set courses and their shared controls (D27).
export function EventExport({ onDownload }: { onDownload: () => void }) {
  const m = useMessages().event
  return (
    <div className="event-export">
      <button type="button" className="panel-line-action" onClick={onDownload}>
        {m.downloadEventXml}
      </button>
      <p className="request-note">{m.eventXmlNote}</p>
    </div>
  )
}
