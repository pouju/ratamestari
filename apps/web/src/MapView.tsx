import { useEffect, useRef, useState } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Collection from 'ol/Collection'
import Circle from 'ol/geom/Circle'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import Projection from 'ol/proj/Projection'
import Translate from 'ol/interaction/Translate'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import { localPoint, type LocalPoint, type MapInfo } from '@ratamestari/core'
import type { ControlSiteCandidate, LegEvaluation, TechnicalDifficulty } from '@ratamestari/engine'
import type { CostMapImage } from './cost-map-image'
import type { MapImage } from './rasterize'
import 'ol/ol.css'

const COURSE_OVERPRINT_PURPLE = 'rgb(190, 30, 180)'
const ROUTE_BLUE = 'rgba(0, 110, 255, 0.85)'
const ROUTE_WIDTH_PIXELS = 3
const ALTERNATIVE_ROUTE_DASH_PIXELS = [8, 6]
const CONTROL_CIRCLE_DIAMETER_MM = 5
const COURSE_LINE_WIDTH_MM = 0.35
const INITIAL_CONTROL_OFFSET_METERS = 300
const SITE_DOT_RADIUS_PIXELS = 3
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

const paperMmToGroundMeters = (mm: number, scale: number) => (mm * scale) / 1000

export type ControlPair = readonly [LocalPoint, LocalPoint]

interface Props {
  info: MapInfo
  image: MapImage
  leg: LegEvaluation | null
  costMap: CostMapImage | null
  sites: readonly ControlSiteCandidate[] | null
  onControlsMoved: (controls: ControlPair) => void
}

export function MapView({ info, image, leg, costMap, sites, onControlsMoved }: Props) {
  const target = useRef<HTMLDivElement>(null)
  const [routeSource] = useState(() => new VectorSource())
  const [costLayer] = useState(() => new ImageLayer<ImageStatic>({ visible: false }))
  const localFrameRef = useRef<Projection | null>(null)
  const [siteSource] = useState(() => new VectorSource())
  const onControlsMovedRef = useRef(onControlsMoved)
  onControlsMovedRef.current = onControlsMoved

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
        new VectorLayer({
          source: new VectorSource({ features: [...controls] }),
          style: (_feature, metersPerPixel) =>
            new Style({
              stroke: new Stroke({
                color: COURSE_OVERPRINT_PURPLE,
                width: Math.max(1, courseLineWidthMeters / metersPerPixel),
              }),
            }),
        }),
      ],
      view: new View({ projection: localFrame, extent, constrainOnlyCenter: true }),
    })
    map.getView().fit(extent, { padding: [20, 20, 20, 20] })

    const centerOf = (control: Feature<Circle>) => {
      const [x = 0, y = 0] = control.getGeometry()!.getCenter()
      return localPoint(x, y)
    }
    const reportControls = () =>
      onControlsMovedRef.current([centerOf(controls[0]), centerOf(controls[1])])
    const translate = new Translate({ features: new Collection([...controls]) })
    translate.on('translateend', reportControls)
    map.addInteraction(translate)
    reportControls()

    return () => map.setTarget(undefined)
  }, [info, image, routeSource, costLayer, siteSource])

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
    routeSource.clear()
    if (!leg) return
    const toFeature = (points: LegEvaluation['fastest']['points'], isAlternative: boolean) =>
      new Feature({ geometry: new LineString(points.map(p => [...p])), isAlternative })
    routeSource.addFeatures([
      ...leg.alternatives.map(route => toFeature(route.points, true)),
      toFeature(leg.fastest.points, false),
    ])
  }, [leg, routeSource])

  return <div ref={target} className="map" />
}
