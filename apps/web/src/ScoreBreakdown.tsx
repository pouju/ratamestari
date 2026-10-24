import type { Course } from '@ratamestari/engine'
import { useMessages } from './i18n'

const SHOWN_FROM_CONTRIBUTION = 0.05

export function ScoreBreakdown({ course }: { course: Course }) {
  const m = useMessages().scoreBreakdown
  const terms = Object.entries(course.breakdown.terms)
    .filter(([, term]) => term.weight > 0 && Math.abs(term.contribution) >= SHOWN_FROM_CONTRIBUTION)
    .sort(([, a], [, b]) => b.contribution - a.contribution)
  return (
    <details className="breakdown">
      <summary>{m.summary(course.breakdown.total.toFixed(0))}</summary>
      <table>
        <tbody>
          {terms.map(([name, term]) => (
            <tr key={name}>
              <td>{m.terms[name as keyof typeof m.terms]}</td>
              <td className="number">
                {term.contribution > 0 ? '+' : ''}
                {term.contribution.toFixed(1)}
              </td>
              <td className="note">{term.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
