import { useMessages } from './i18n'

export type MapOpening =
  | { readonly status: 'empty' }
  | { readonly status: 'loading'; readonly fileName: string }
  | { readonly status: 'error'; readonly message: string }

interface MapStartProps {
  opening: MapOpening
  isDraggingOver: boolean
  onChooseFile: () => void
}

export function MapStart({ opening, isDraggingOver, onChooseFile }: MapStartProps) {
  const m = useMessages().workspace
  return (
    <div className={isDraggingOver ? 'map-start is-dragging-over' : 'map-start'}>
      <div className="map-start-content">
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          aria-hidden="true"
          className="map-start-mark"
        >
          <polygon points="36,8 64,58 8,58" />
        </svg>
        {opening.status === 'loading' ? (
          <>
            <h2>{m.opening(opening.fileName)}</h2>
            <p>{m.openingHint}</p>
          </>
        ) : (
          <>
            <h2>{isDraggingOver ? m.dropToOpen : m.openMap}</h2>
            <p>{m.openMapHint}</p>
            <button type="button" className="map-start-choose" onClick={onChooseFile}>
              {m.chooseFile}
            </button>
            {opening.status === 'error' && (
              <p className="error" role="alert">
                {m.openFailed(opening.message)}
              </p>
            )}
          </>
        )}
        <p className="map-start-privacy">{m.privacy}</p>
      </div>
    </div>
  )
}

interface PanelHeaderProps {
  onOpenSettings: () => void
}

export function PanelHeader({ onOpenSettings }: PanelHeaderProps) {
  const m = useMessages().workspace
  return (
    <div className="panel-header">
      <h1>
        <a href="../" className="panel-wordmark">
          <svg width="20" height="20" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="10" fill="none" stroke="currentColor" strokeWidth="2.8" />
            <circle cx="13" cy="13" r="2.4" fill="currentColor" />
          </svg>
          Ratamestari
        </a>
      </h1>
      <button
        type="button"
        className="panel-settings"
        aria-label={m.settings}
        onClick={onOpenSettings}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
      </button>
    </div>
  )
}

interface PanelLineProps {
  label: string
  value: string
  isPending?: boolean
  action?: { readonly label: string; readonly onClick: () => void } | undefined
}

export function PanelLine({ label, value, isPending = false, action }: PanelLineProps) {
  return (
    <div className={isPending ? 'panel-line is-pending' : 'panel-line'}>
      <span className="panel-line-label">{label}</span>
      <span className="panel-line-value">
        <span>{value}</span>
        {action && (
          <button type="button" className="panel-line-action" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </span>
    </div>
  )
}
