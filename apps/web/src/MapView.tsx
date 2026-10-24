import { useEffect, useRef, useState } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Collection from 'ol/Collection'
import Circle from 'ol/geom/Circle'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import Projection from 'ol/proj/Projection'
import Translate from 'ol/interaction/Translate'
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style } from 'ol/style'
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
} from './course-overprint'
import type { CostMapImage } from './cost-map-image'
import type { DescriptionBox } from './description-box'
import type { MapImage } from './rasterize'
import 'ol/ol.css'

const ROUTE_BLUE = 'rgba(0, 110, 255, 0.85)'
const ROUTE_WIDTH_PIXELS = 3
const ALTERNATIVE_ROUTE_DASH_PIXELS = [8, 6]
const CONTROL_CIRCLE_DIAMETER_MM = 5
const COURSE_LINE_WIDTH_MM = 0.35
const INITIAL_CONTROL_OFFSET_METERS = 300
const SITE_DOT_RADIUS_PIXELS = 3
const CENTRE_MARKER_RADIUS_PIXELS = 9
const centreStyle = new Style({
  image: new RegularShape({
    points: 4,
    radius: CENTRE_MARKER_RADIUS_PIXELS,
    angle: Math.PI / 4,
    fill: new Fill({ color: 'rgba(0, 0, 0, 0.85)' }),
    stroke: new Stroke({ color: 'white', width: 2 }),
  }),
})
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

export type ControlPair = readonly [LocalPoint, LocalPoint]

interface Props {
  info: MapInfo
  image: MapImage
  leg: LegEvaluation | null
  costMap: CostMapImage | null
  sites: readonly ControlSiteCandidate[] | null
  course: Course | null
  descriptionBox: DescriptionBox | null
  competitionCentre: LocalPoint | null
  isPickingCentre: boolean
  showLegTool: boolean
  onControlsMoved: (controls: ControlPair) => void
  onCentrePicked: (centre: LocalPoint) => void
}

export function MapView({
  info,
  image,
  leg,
  costMap,
  sites,
  course,
  descriptionBox,
  competitionCentre,
  isPickingCentre,
  showLegTool,
  onControlsMoved,
  onCentrePicked,
}: Props) {
  const target = useRef<HTMLDivElement>(null)
  const [routeSource] = useState(() => new VectorSource())
  const [costLayer] = useState(() => new ImageLayer<ImageStatic>({ visible: false }))
  const [descriptionLayer] = useState(() => new ImageLayer<ImageStatic>({ visible: false }))
  const [printFrameSource] = useState(() => new VectorSource())
  const localFrameRef = useRef<Projection | null>(null)
  const [siteSource] = useState(() => new VectorSource())
  const [courseSource] = useState(() => new VectorSource())
  const [centreSource] = useState(() => new VectorSource())
  const [legToolLayer] = useState(() => new VectorLayer({ source: new VectorSource() }))
  const [legToolFeatures] = useState(() => new Collection<Feature>())
  const [legToolTranslate] = useState(() => new Translate({ features: legToolFeatures }))
  const onControlsMovedRef = useRef(onControlsMoved)
  onControlsMovedRef.current = onControlsMoved
  const onCentrePickedRef = useRef(onCentrePicked)
  onCentrePickedRef.current = onCentrePicked
  const isPickingCentreRef = useRef(isPickingCentre)
  isPickingCentreRef.current = isPickingCentre

  useEffect(() => {
    if (!target.current) return
    const extent = [...info.extent]
    const localFrame = new Projection({ code: 'map-local', units: 'm', extent })
    localFrameRef.current = localFrame
    const [minX, minY, maxX, maxY] = info.extent
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const radius = paperMmToGroundMeters(CONTROL_CIRCLE_DIAMETER_MM, info.scale) / 2
    const controls = [
      new Feature(new Circle([centerX - INITIAL_CONTROL_OFFSET_METERS, centerY], radius)),
      new Feature(new Circle([centerX + INITIAL_CONTROL_OFFSET_METERS, centerY], radius)),
    ] as const
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
        new VectorLayer({
          source: routeSource,
          style: feature =>
            new Style({
              stroke: new Stroke({
                color: ROUTE_BLUE,
                width: ROUTE_WIDTH_PIXELS,
                ...(feature.get('isAlternative')
                  ? { lineDash: ALTERNATIVE_ROUTE_DASH_PIXELS }
                  : {}),
              }),
            }),
        }),
        new VectorLayer({ source: printFrameSource, style: printFrameStyle }),
        new VectorLayer({ source: courseSource, style: courseOverprintStyle }),
        descriptionLayer,
        legToolLayer,
        new VectorLayer({ source: centreSource, style: centreStyle }),
      ],
      view: new View({ projection: localFrame, extent, constrainOnlyCenter: true }),
    })
    map.getView().fit(extent, { padding: [20, 20, 20, 20] })

    const legToolSource = legToolLayer.getSource()!
    legToolSource.clear()
    legToolSource.addFeatures([...controls])
    legToolLayer.setStyle(
      (_feature, metersPerPixel) =>
        new Style({
          stroke: new Stroke({
            color: COURSE_OVERPRINT_PURPLE,
            width: Math.max(1, courseLineWidthMeters / metersPerPixel),
          }),
        }),
    )
    map.on('singleclick', event => {
      if (!isPickingCentreRef.current) return
      const [x = 0, y = 0] = event.coordinate
      onCentrePickedRef.current(localPoint(x, y))
    })

    const centerOf = (control: Feature<Circle>) => {
      const [x = 0, y = 0] = control.getGeometry()!.getCenter()
      return localPoint(x, y)
    }
    const reportControls = () =>
      onControlsMovedRef.current([centerOf(controls[0]), centerOf(controls[1])])
    legToolFeatures.clear()
    legToolFeatures.extend([...controls])
    legToolTranslate.on('translateend', reportControls)
    map.addInteraction(legToolTranslate)
    reportControls()

    return () => {
      legToolTranslate.un('translateend', reportControls)
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
    legToolFeatures,
    legToolTranslate,
  ])

  useEffect(() => {
    legToolLayer.setVisible(showLegTool)
    legToolTranslate.setActive(showLegTool)
  }, [showLegTool, legToolLayer, legToolTranslate])

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
    if (!leg || !showLegTool) return
    const toFeature = (points: LegEvaluation['fastest']['points'], isAlternative: boolean) =>
      new Feature({ geometry: new LineString(points.map(p => [...p])), isAlternative })
    routeSource.addFeatures([
      ...leg.alternatives.map(route => toFeature(route.points, true)),
      toFeature(leg.fastest.points, false),
    ])
  }, [leg, routeSource, showLegTool])

  return <div ref={target} className={isPickingCentre ? 'map picking' : 'map'} />
}
