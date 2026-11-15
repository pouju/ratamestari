import { useState } from 'react'
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
  onRename: (courseId: string, name: string) => void
  onRemove: (courseId: string) => void
}

// The courses of the event side by side (D27); each keeps its own request, course and print.
// Tapping the shown course again names or removes it.
export function CourseTabs({
  tabs,
  selected,
  isDisabled,
  onSelect,
  onAdd,
  onRename,
  onRemove,
}: Props) {
  const m = useMessages().event
  const [isNaming, setIsNaming] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const shown = tabs.find(tab => tab.id === selected)

  const stopNaming = () => {
    setIsNaming(false)
    setIsRemoving(false)
  }

  return (
    <>
      <nav aria-label={m.coursesLabel} className="check-tabs course-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            aria-current={tab.id === selected ? 'page' : undefined}
            aria-expanded={tab.id === selected ? isNaming : undefined}
            disabled={isDisabled && tab.id !== selected}
            onClick={() => {
              if (tab.id === selected) {
                if (isNaming) stopNaming()
                else if (!isDisabled) setIsNaming(true)
                return
              }
              stopNaming()
              onSelect(tab.id)
            }}
          >
            {m.courseTab(tab.name, tab.courseClass)}
          </button>
        ))}
        <button
          type="button"
          className="add-course"
          disabled={isDisabled}
          onClick={() => {
            stopNaming()
            onAdd()
          }}
        >
          {m.addCourse}
        </button>
      </nav>
      {isNaming && shown && (
        <div className="course-naming">
          <label>
            {m.courseName}
            <input
              type="text"
              defaultValue={shown.name}
              autoFocus
              onBlur={e => onRename(shown.id, e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onRename(shown.id, e.currentTarget.value)
                  stopNaming()
                }
                if (e.key === 'Escape') stopNaming()
              }}
            />
          </label>
          {tabs.length > 1 && (
            <button
              type="button"
              className="panel-line-action"
              onClick={() => {
                if (!isRemoving) {
                  setIsRemoving(true)
                  return
                }
                stopNaming()
                onRemove(shown.id)
              }}
            >
              {isRemoving ? m.confirmRemove(shown.name) : m.removeCourse}
            </button>
          )}
          <button type="button" className="panel-line-action" onClick={stopNaming}>
            {m.doneNaming}
          </button>
        </div>
      )}
    </>
  )
}

interface ListProps {
  hasOwnList: boolean
  isDisabled: boolean
  onApply: (list: 'weekly' | 'own') => void
  // False when the browser refused to keep it.
  onSaveOwn: () => boolean
}

// Starting the event's courses from a list, and keeping this event's courses as the club's own.
export function CourseLists({ hasOwnList, isDisabled, onApply, onSaveOwn }: ListProps) {
  const m = useMessages().event
  const [isSaved, setIsSaved] = useState(false)
  return (
    <div className="course-lists">
      <p className="request-sentence course-kind">
        <label>
          {m.startFrom}{' '}
          <select
            className="request-token"
            value=""
            disabled={isDisabled}
            onChange={e => {
              const list = e.target.value
              if (list === 'weekly' || list === 'own') onApply(list)
            }}
          >
            <option value="">{m.courseLists.choose}</option>
            <option value="weekly">{m.courseLists.weekly}</option>
            {hasOwnList && <option value="own">{m.courseLists.own}</option>}
          </select>
        </label>
      </p>
      <p className="request-note">{m.listNote}</p>
      <button
        type="button"
        className="panel-line-action"
        disabled={isDisabled}
        onClick={() => setIsSaved(onSaveOwn())}
      >
        {m.saveOwnList}
      </button>
      {isSaved && (
        <p className="request-note" role="status">
          {m.ownListSaved}
        </p>
      )}
    </div>
  )
}
