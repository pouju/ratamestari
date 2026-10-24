import { useEffect, useRef, useState, type ReactNode } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Circle from 'ol/geom/Circle'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import Projection from 'ol/proj/Projection'
import Translate, { type TranslateEvent } from 'ol/interaction/Translate'
import type Geometry from 'ol/geom/Geometry'
import type { FeatureLike } from 'ol/Feature'
import { asArray } from 'ol/color'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { localPoint, type LocalExtent, type LocalPoint, type MapInfo } from '@ratamestari/core'
import type {
  ControlSiteCandidate,
  Course,
  LegEvaluation,
  TechnicalDifficulty,
} from '@ratamestari/engine'
import {
  COURSE_OVERPRINT_PURPLE,
  courseOverprintFeatures,
  courseOverprintStyle,
  legOfFeature,
  shortenedLeg,
  STOP_INDEX,
} from './course-overprint'
import { useMessages } from './i18n'
import {
  needsPlacing,
  placeNext,
  plannedEnds,
  pointAlong,
  rankedRoutes,
  ROUTE_COLOUR_TOKENS,
  type PlannedLeg,
} from './leg-routes'
import type { CostMapImage } from './cost-map-image'
import type { DescriptionBox } from './description-box'
import type { MapImage } from './rasterize'
import 'ol/ol.css'

const ROUTE_WIDTH_PIXELS = 10
const ROUTE_LABEL_RADIUS_PIXELS = 10
const ROUTE_LABEL_SHARE_OF_ROUTE = 0.45
const LEG_HIT_TOLERANCE_PIXELS = 6
const CONTROL_CIRCLE_DIAMETER_MM = 5
const COURSE_LINE_WIDTH_MM = 0.35
const SITE_DOT_RADIUS_PIXELS = 3
const CENTRE_MARKER_RADIUS_PIXELS = 11
const CENTRE_MARKER_DOT_PIXELS = 3.5
const centreStyle = [
  new Style({
    image: new CircleStyle({
      radius: CENTRE_MARKER_RADIUS_PIXELS,
      fill: new Fill({ color: 'black' }),
      stroke: new Stroke({ color: 'white', width: 3 }),
    }),
  }),
  new Style({
    image: new CircleStyle({
      radius: CENTRE_MARKER_DOT_PIXELS,
      fill: new Fill({ color: 'white' }),
    }),
  }),
]
export const DIFFICULTY_COLOURS: Readonly<Record<TechnicalDifficulty, string>> = {
  1: '#2e7d32',
  2: '#7cb342',
  3: '#fbc02d',
  4: '#f57c00',
  5: '#c62828',
}
const siteStyles = Object.fromEntries(
  Object.entries(DIFFICULTY_COLOURS).map(([difficulty, colour]) => [
    difficulty,
    new Style({
      image: new CircleStyle({
        radius: SITE_DOT_RADIUS_PIXELS,
        fill: new Fill({ color: colour }),
        stroke: new Stroke({ color: 'white', width: 1 }),
      }),
    }),
  ]),
)

const DRAG_HIT_TOLERANCE_PIXELS = 8

const cssToken = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function routeStyle(feature: FeatureLike): Style {
  const colour = feature.get('colour') as string
  const letter = feature.get('letter') as string | undefined
  if (letter === undefined) {
    const [red = 0, green = 0, blue = 0] = asArray(colour)
    return new Style({
      stroke: new Stroke({
        color: [red, green, blue, Number(cssToken('--route-opacity'))],
        width: ROUTE_WIDTH_PIXELS,
        lineCap: 'round',
        lineJoin: 'round',
      }),
    })
  }
  return new Style({
    image: new CircleStyle({
      radius: ROUTE_LABEL_RADIUS_PIXELS,
      fill: new Fill({ color: colour }),
      stroke: new Stroke({ color: 'white', width: 2 }),
    }),
    text: new Text({
      text: letter,
      font: `bold 12px ${cssToken('--font-family')}`,
      fill: new Fill({ color: 'white' }),
    }),
  })
}

function centreOf(geometry: Geometry): LocalPoint {
  if (geometry instanceof Circle) {
    const [x = 0, y = 0] = geometry.getCenter()
    return localPoint(x, y)
  }
  const corners = geometry instanceof Polygon ? geometry.getCoordinates()[0]!.slice(0, -1) : []
  let sumX = 0
  let sumY = 0
  for (const [x = 0, y = 0] of corners) {
    sumX += x
    sumY += y
  }
  const count = Math.max(1, corners.length)
  return localPoint(sumX / count, sumY / count)
}

const PRINT_FRAME_MARGIN_METERS = 2000
const printFrameStyle = new Style({
  fill: new Fill({ color: 'rgba(40, 40, 40, 0.35)' }),
  stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.9)', width: 2 }),
})

function outsideOf(frame: LocalExtent, map: LocalExtent): Polygon {
  const [minX, minY, maxX, maxY] = frame
  const left = Math.min(minX, map[0]) - PRINT_FRAME_MARGIN_METERS
  const bottom = Math.min(minY, map[1]) - PRINT_FRAME_MARGIN_METERS
  const right = Math.max(maxX, map[2]) + PRINT_FRAME_MARGIN_METERS
  const top = Math.max(maxY, map[3]) + PRINT_FRAME_MARGIN_METERS
  return new Polygon([
    [
      [left, bottom],
      [right, bottom],
      [right, top],
      [left, top],
      [left, bottom],
    ],
    [
      [minX, minY],
      [minX, maxY],
      [maxX, maxY],
      [maxX, minY],
      [minX, minY],
    ],
  ])
}

const paperMmToGroundMeters = (mm: number, scale: number) => (mm * scale) / 1000

interface Props {
  info: MapInfo
  image: MapImage
  routes: LegEvaluation | null
  selectedLeg: number | null
  onLegSelected: (leg: number) => void
  costMap: CostMapImage | null
  sites: readonly ControlSiteCandidate[] | null
  course: Course | null
  descriptionBox: DescriptionBox | null
  competitionCentre: LocalPoint | null
  isPickingCentre: boolean
  plannedLeg: PlannedLeg | null
  onPlannedLegChanged: (plan: PlannedLeg) => void
  onCentrePicked: (centre: LocalPoint) => void
  onStopMoved: (stopIndex: number, to: LocalPoint) => void
  canEditCourse: boolean
  tools: ReactNode
  footer: ReactNode
}

const ZOOM_STEP = 1
const ZOOM_ANIMATION_MS = 200

export function MapView({
  info,
  image,
  routes,
  selectedLeg,
  onLegSelected,
  costMap,
  sites,
  course,
  descriptionBox,
  competitionCentre,
  isPickingCentre,
  plannedLeg,
  onPlannedLegChanged,
  onCentrePicked,
  onStopMoved,
  canEditCourse,
  tools,
  footer,
}: Props) {
  const target = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OlMap | null>(null)
  const messages = useMessages()
  const [routeSource] = useState(() => new VectorSource())
  const [costLayer] = useState(() => new ImageLayer<ImageStatic>({ visible: false }))
  const [descriptionLayer] = useState(() => new ImageLayer<ImageStatic>({ visible: false }))
  const [printFrameSource] = useState(() => new VectorSource())
  const localFrameRef = useRef<Projection | null>(null)
  const [siteSource] = useState(() => new VectorSource())
  const [courseSource] = useState(() => new VectorSource())
  const [courseLayer] = useState(
    () => new VectorLayer({ source: courseSource, style: courseOverprintStyle(null) }),
  )
  const selectedLegRef = useRef(selectedLeg)
  selectedLegRef.current = selectedLeg
  const lastPointerType = useRef<string>('mouse')
  const [courseTranslate] = useState(
    () =>
      new Translate({
        layers: [courseLayer],
        // A finger panning the map must not move a control by accident, so on touch only the
        // ends of the selected leg can be dragged.
        filter: feature => {
          const stop = feature.get(STOP_INDEX)
          if (typeof stop !== 'number') return false
          if (lastPointerType.current !== 'touch') return true
          const leg = selectedLegRef.current
          return leg !== null && (stop === leg || stop === leg + 1)
        },
        hitTolerance: DRAG_HIT_TOLERANCE_PIXELS,
      }),
  )
  const onStopMovedRef = useRef(onStopMoved)
  onStopMovedRef.current = onStopMoved
  const [centreSource] = useState(() => new VectorSource())
  const [legToolLayer] = useState(() => new VectorLayer({ source: new VectorSource() }))
  const [plannedLegFeatures] = useState(() => ({
    from: new Feature<Circle>(),
    to: new Feature<Circle>(),
    line: new Feature<LineString>(),
  }))
  const [legToolTranslate] = useState(
    () =>
      new Translate({
        layers: [legToolLayer],
        filter: feature => feature !== plannedLegFeatures.line,
      }),
  )
  const plannedLegRef = useRef(plannedLeg)
  plannedLegRef.current = plannedLeg
  const onPlannedLegChangedRef = useRef(onPlannedLegChanged)
  onPlannedLegChangedRef.current = onPlannedLegChanged
  const onCentrePickedRef = useRef(onCentrePicked)
  onCentrePickedRef.current = onCentrePicked
  const isPickingCentreRef = useRef(isPickingCentre)
  isPickingCentreRef.current = isPickingCentre
  const onLegSelectedRef = useRef(onLegSelected)
  onLegSelectedRef.current = onLegSelected
  const routeLetters = messages.leg.routeLetters

  useEffect(() => {
    if (!target.current) return
    const extent = [...info.extent]
    const localFrame = new Projection({ code: 'map-local', units: 'm', extent })
    localFrameRef.current = localFrame
    const courseLineWidthMeters = paperMmToGroundMeters(COURSE_LINE_WIDTH_MM, info.scale)

    const map = new OlMap({
      target: target.current,
      layers: [
        new ImageLayer({
          source: new ImageStatic({ url: image.url, imageExtent: extent, projection: localFrame }),
        }),
        costLayer,
        new VectorLayer({
          source: siteSource,
          style: feature => siteStyles[feature.get('technicalDifficulty')],
        }),
        new VectorLayer({ source: printFrameSource, style: printFrameStyle }),
        new VectorLayer({ source: routeSource, style: routeStyle }),
        courseLayer,
        descriptionLayer,
        legToolLayer,
        new VectorLayer({ source: centreSource, style: centreStyle }),
      ],
      controls: [],
      view: new View({ projection: localFrame, extent, constrainOnlyCenter: true }),
    })
    mapRef.current = map
    map.getView().fit(extent, { padding: [20, 20, 20, 20] })

    legToolLayer.setStyle(
      (_feature, metersPerPixel) =>
        new Style({
          stroke: new Stroke({
            color: COURSE_OVERPRINT_PURPLE,
            width: Math.max(1, courseLineWidthMeters / metersPerPixel),
          }),
        }),
    )
    const rememberPointerType = (event: PointerEvent) => {
      lastPointerType.current = event.pointerType
    }
    const element = target.current
    element.addEventListener('pointerdown', rememberPointerType, { capture: true })

    map.on('singleclick', event => {
      if (isPickingCentreRef.current) {
        const [x = 0, y = 0] = event.coordinate
        onCentrePickedRef.current(localPoint(x, y))
        return
      }
      const plan = plannedLegRef.current
      if (plan && needsPlacing(plan)) {
        const [x = 0, y = 0] = event.coordinate
        onPlannedLegChangedRef.current(placeNext(plan, localPoint(x, y)))
        return
      }
      // Wrapped because the lookup stops only on a truthy result, and the first leg is 0.
      const hit = map.forEachFeatureAtPixel(
        event.pixel,
        feature => {
          const leg = legOfFeature(feature)
          return leg === null ? undefined : { leg }
        },
        { layerFilter: layer => layer === courseLayer, hitTolerance: LEG_HIT_TOLERANCE_PIXELS },
      )
      if (hit) onLegSelectedRef.current(hit.leg)
    })

    const reportPlannedLeg = () => {
      const plan = plannedLegRef.current
      if (!plan) return
      const centreOfPlanned = (feature: Feature<Circle>) => {
        const geometry = feature.getGeometry()
        return geometry ? centreOf(geometry) : null
      }
      onPlannedLegChangedRef.current({
        from: plan.from && centreOfPlanned(plannedLegFeatures.from),
        to: plan.to && centreOfPlanned(plannedLegFeatures.to),
      })
    }
    legToolTranslate.on(['translating', 'translateend'], reportPlannedLeg)
    map.addInteraction(legToolTranslate)

    const reportStopMoved = (event: TranslateEvent) => {
      const feature = event.features.item(0)
      const stopIndex = feature?.get(STOP_INDEX)
      const geometry = feature?.getGeometry()
      if (typeof stopIndex !== 'number' || !geometry) return
      onStopMovedRef.current(stopIndex, centreOf(geometry))
    }
    courseTranslate.on('translateend', reportStopMoved)
    map.addInteraction(courseTranslate)

    return () => {
      courseTranslate.un('translateend', reportStopMoved)
      legToolTranslate.un(['translating', 'translateend'], reportPlannedLeg)
      element.removeEventListener('pointerdown', rememberPointerType, { capture: true })
      map.setTarget(undefined)
    }
  }, [
    info,
    image,
    routeSource,
    costLayer,
    descriptionLayer,
    printFrameSource,
    siteSource,
    courseSource,
    centreSource,
    legToolLayer,
    legToolTranslate,
    plannedLegFeatures,
    courseLayer,
    courseTranslate,
  ])

  useEffect(() => {
    courseTranslate.setActive(canEditCourse)
  }, [canEditCourse, courseTranslate])

  useEffect(() => {
    courseLayer.setStyle(courseOverprintStyle(selectedLeg))
  }, [selectedLeg, courseLayer])

  useEffect(() => {
    const source = legToolLayer.getSource()!
    const radius = paperMmToGroundMeters(CONTROL_CIRCLE_DIAMETER_MM, info.scale) / 2
    for (const role of ['from', 'to'] as const) {
      const feature = plannedLegFeatures[role]
      const point = plannedLeg?.[role] ?? null
      if (!point) {
        if (source.hasFeature(feature)) source.removeFeature(feature)
        continue
      }
      const geometry = feature.getGeometry()
      const [x = 0, y = 0] = geometry?.getCenter() ?? []
      if (!geometry) feature.setGeometry(new Circle([...point], radius))
      else if (x !== point[0] || y !== point[1] || geometry.getRadius() !== radius)
        geometry.setCenterAndRadius([...point], radius)
      if (!source.hasFeature(feature)) source.addFeature(feature)
    }
    const { line } = plannedLegFeatures
    const ends = plannedLeg && plannedEnds(plannedLeg)
    const linePoints = ends && shortenedLeg(ends[0], ends[1], radius, radius)
    if (linePoints) {
      line.setGeometry(new LineString(linePoints))
      if (!source.hasFeature(line)) source.addFeature(line)
    } else if (source.hasFeature(line)) source.removeFeature(line)
    legToolTranslate.setActive(plannedLeg !== null)
  }, [plannedLeg, info, legToolLayer, legToolTranslate, plannedLegFeatures])

  useEffect(() => {
    courseSource.clear()
    if (course) courseSource.addFeatures(courseOverprintFeatures(course))
  }, [course, courseSource])

  useEffect(() => {
    centreSource.clear()
    if (competitionCentre) centreSource.addFeature(new Feature(new Point([...competitionCentre])))
  }, [competitionCentre, centreSource])

  useEffect(() => {
    siteSource.clear()
    if (!sites) return
    siteSource.addFeatures(
      sites.map(
        site =>
          new Feature({
            geometry: new Point([...site.position]),
            technicalDifficulty: site.technicalDifficulty,
          }),
      ),
    )
  }, [sites, siteSource])

  useEffect(() => {
    costLayer.setVisible(costMap !== null)
    if (!costMap || !localFrameRef.current) return
    costLayer.setSource(
      new ImageStatic({
        url: costMap.url,
        imageExtent: [...costMap.extent],
        projection: localFrameRef.current,
      }),
    )
  }, [costMap, costLayer])

  useEffect(() => {
    printFrameSource.clear()
    const area = course?.printArea
    if (!area) return
    printFrameSource.addFeature(new Feature(outsideOf(area.extent, info.extent)))
  }, [course?.printArea, info, printFrameSource])

  useEffect(() => {
    descriptionLayer.setVisible(descriptionBox !== null)
    if (!descriptionBox || !localFrameRef.current) return
    descriptionLayer.setSource(
      new ImageStatic({
        url: descriptionBox.url,
        imageExtent: [...descriptionBox.extent],
        projection: localFrameRef.current,
      }),
    )
  }, [descriptionBox, descriptionLayer])

  useEffect(() => {
    routeSource.clear()
    if (!routes) return
    const ranked = rankedRoutes(routes).map((ranked, i) => ({
      ...ranked,
      colour: cssToken(ROUTE_COLOUR_TOKENS[ranked.rank]),
      letter: routeLetters[i] ?? '',
    }))
    const slowestFirst = [...ranked].reverse()
    const lines = slowestFirst.map(
      ({ route, colour }) =>
        new Feature({ geometry: new LineString(route.points.map(p => [...p])), colour }),
    )
    const labels = slowestFirst.flatMap(({ route, colour, letter }) => {
      const at = pointAlong(route.points, ROUTE_LABEL_SHARE_OF_ROUTE)
      return at ? [new Feature({ geometry: new Point([...at]), colour, letter })] : []
    })
    routeSource.addFeatures([...lines, ...labels])
  }, [routes, routeSource, routeLetters])

  const zoomBy = (delta: number) => {
    const view = mapRef.current?.getView()
    const zoom = view?.getZoom()
    if (view && zoom !== undefined)
      view.animate({ zoom: zoom + delta, duration: ZOOM_ANIMATION_MS })
  }

  const isPlacing = isPickingCentre || (plannedLeg !== null && needsPlacing(plannedLeg))
  return (
    <div className="map-frame">
      <div ref={target} className={isPlacing ? 'map picking' : 'map'} />
      <div className="map-toolbar" role="toolbar" aria-label={messages.map.toolbar}>
        <button
          type="button"
          className="map-tool-icon"
          aria-label={messages.map.zoomIn}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="map-tool-icon"
          aria-label={messages.map.zoomOut}
          onClick={() => zoomBy(-ZOOM_STEP)}
        >
          −
        </button>
        {tools}
      </div>
      <div className="map-footer">{footer}</div>
    </div>
  )
}
