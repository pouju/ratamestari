import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import type { Course, PaperChoice, PrintFrame } from '@ratamestari/engine'
import {
  paperSizeSchema,
  PRINT_SCALE,
  printScaleSchema,
  type Format,
  type PrintScaleChoice,
} from '@ratamestari/rules'
import { useFormat, useMessages } from './i18n'
import { DIFFICULTY_COLOURS } from './MapView'

const paperChoiceSchema = z.union([z.literal('auto'), paperSizeSchema])

interface MenuProps {
  label: ReactNode
  className: string
  placement: 'below' | 'above'
  children: ReactNode
}

function ToolMenu({ label, className, placement, children }: MenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [isOpen])

  return (
    <div
      ref={root}
      className="tool-menu"
      onKeyDown={event => {
        if (event.key === 'Escape') setIsOpen(false)
      }}
    >
      <button
        type="button"
        className={className}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(open => !open)}
      >
        {label}
      </button>
      <div id={panelId} className={`tool-menu-panel tool-menu-${placement}`} hidden={!isOpen}>
        {children}
      </div>
    </div>
  )
}

interface LayersProps {
  showCostMap: boolean
  onShowCostMap: (show: boolean) => void
  showSites: boolean
  onShowSites: (show: boolean) => void
  siteCount: number | null
}

export function LayersMenu({
  showCostMap,
  onShowCostMap,
  showSites,
  onShowSites,
  siteCount,
}: LayersProps) {
  const m = useMessages().map
  return (
    <ToolMenu label={m.layers} className="map-tool" placement="below">
      <label className="tool-menu-option">
        <input
          type="checkbox"
          checked={showCostMap}
          onChange={e => onShowCostMap(e.target.checked)}
        />
        {m.costMap}
      </label>
      {showCostMap && <p className="tool-menu-note">{m.costMapLegend}</p>}
      <label className="tool-menu-option">
        <input type="checkbox" checked={showSites} onChange={e => onShowSites(e.target.checked)} />
        {m.sites}
      </label>
      {showSites && (
        <p className="tool-menu-note">
          {siteCount !== null && `${m.siteCount(siteCount)} `}
          {m.difficulty}{' '}
          {Object.entries(DIFFICULTY_COLOURS).map(([difficulty, colour]) => (
            <span key={difficulty} className="legend-dot" style={{ background: colour }}>
              {difficulty}
            </span>
          ))}
        </p>
      )}
    </ToolMenu>
  )
}

interface ToggleToolProps {
  isActive: boolean
  isDisabled: boolean
  onToggle: () => void
}

export function PlanLegTool({ isActive, isDisabled, onToggle }: ToggleToolProps) {
  const m = useMessages().map
  return (
    <button
      type="button"
      className="map-tool"
      aria-pressed={isActive}
      disabled={isDisabled}
      onClick={onToggle}
    >
      {m.planLeg}
    </button>
  )
}

export function EditControlsTool({ isActive, isDisabled, onToggle }: ToggleToolProps) {
  const m = useMessages().map
  return (
    <button
      type="button"
      className="map-tool"
      aria-pressed={isActive}
      disabled={isDisabled}
      onClick={onToggle}
    >
      {m.editControls}
    </button>
  )
}

interface PrintLabelProps {
  course: Course | null
  frame: PrintFrame | null
  onChooseArea: () => void
  format: Format
  paper: PaperChoice
  printScale: PrintScaleChoice
  isDisabled: boolean
  onPaperChange: (paper: PaperChoice) => void
  onPrintScaleChange: (scale: PrintScaleChoice) => void
}

export function PrintLabel({
  course,
  frame,
  onChooseArea,
  format: courseFormat,
  paper,
  printScale,
  isDisabled,
  onPaperChange,
  onPrintScaleChange,
}: PrintLabelProps) {
  const m = useMessages().print
  const format = useFormat()
  const area = frame ?? course?.printArea
  const defaultScale = PRINT_SCALE.defaultByFormat[courseFormat]
  const onPaper = area
    ? m.onPaper(area.paper, m.orientation[area.orientation], format.scale(area.scale))
    : m.beforeCourse(
        paper === 'auto' ? m.automaticPaperShort : paper,
        format.scale(printScale === 'auto' ? defaultScale : printScale),
      )
  const summary = frame ? m.placedByYou(onPaper) : onPaper

  return (
    <div className="print-label">
      <span>{summary}</span>
      <ToolMenu label={m.adjust} className="print-label-adjust" placement="above">
        <label className="tool-menu-field">
          {m.paper}
          <select
            value={paper}
            disabled={isDisabled}
            onChange={e => onPaperChange(paperChoiceSchema.parse(e.target.value))}
          >
            <option value="auto">{m.automaticPaper}</option>
            {paperSizeSchema.options.map(size => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <label className="tool-menu-field">
          {m.scale}
          <select
            value={printScale}
            disabled={isDisabled}
            onChange={e =>
              onPrintScaleChange(
                e.target.value === 'auto' ? 'auto' : printScaleSchema.parse(Number(e.target.value)),
              )
            }
          >
            <option value="auto">{m.automaticScale(format.scale(defaultScale))}</option>
            {[...printScaleSchema.values].map(scale => (
              <option key={scale} value={scale}>
                {format.scale(scale)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="tool-menu-action"
          disabled={isDisabled}
          onClick={onChooseArea}
        >
          {frame ? m.moveArea : m.chooseArea}
        </button>
      </ToolMenu>
    </div>
  )
}

const hasCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches

interface PrintFrameBarProps {
  isBusy: boolean
  canSetAgain: boolean
  onTurn: () => void
  onAutomatic: () => void
  onSetAgain: () => void
  onDone: () => void
}

export function PrintFrameBar({
  isBusy,
  canSetAgain,
  onTurn,
  onAutomatic,
  onSetAgain,
  onDone,
}: PrintFrameBarProps) {
  const m = useMessages().print
  return (
    <div className="print-label print-frame-bar" role="group" aria-label={m.chooseArea}>
      <span className="print-frame-hint">
        {hasCoarsePointer() ? m.placingHintTouch : m.placingHint}
      </span>
      <button type="button" aria-label={m.turnLabel} disabled={isBusy} onClick={onTurn}>
        {m.turn}
      </button>
      <button
        type="button"
        aria-label={m.automaticAreaLabel}
        disabled={isBusy}
        onClick={onAutomatic}
      >
        {m.automaticArea}
      </button>
      {canSetAgain && (
        <button type="button" disabled={isBusy} onClick={onSetAgain}>
          {m.setAgainInArea}
        </button>
      )}
      <button type="button" className="print-label-adjust" onClick={onDone}>
        {m.done}
      </button>
    </div>
  )
}
