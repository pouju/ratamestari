import { useMessages } from './i18n'

export interface CourseTab {
  readonly id: string
  readonly name: string
  readonly courseClass: string
}

interface Props {
  tabs: readonly CourseTab[]
  selected: string
  isDisabled: boolean
  onSelect: (courseId: string) => void
  onAdd: () => void
}

// The courses of the event side by side (D27); each keeps its own request, course and print.
export function CourseTabs({ tabs, selected, isDisabled, onSelect, onAdd }: Props) {
  const m = useMessages().event
  return (
    <nav aria-label={m.coursesLabel} className="check-tabs course-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          aria-current={tab.id === selected ? 'page' : undefined}
          disabled={isDisabled && tab.id !== selected}
          onClick={() => onSelect(tab.id)}
        >
          {m.courseTab(tab.name, tab.courseClass)}
        </button>
      ))}
      <button type="button" className="add-course" disabled={isDisabled} onClick={onAdd}>
        {m.addCourse}
      </button>
    </nav>
  )
}
