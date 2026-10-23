import { useEffect, useRef } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Collection from 'ol/Collection'
import Circle from 'ol/geom/Circle'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import Projection from 'ol/proj/Projection'
import Translate from 'ol/interaction/Translate'
import { Stroke, Style } from 'ol/style'
import { localPoint, type LocalPoint, type MapInfo } from '@ratamestari/core'
import type { MapImage } from './rasterize'
import 'ol/ol.css'

const COURSE_OVERPRINT_PURPLE = 'rgb(190, 30, 180)'
const CONTROL_CIRCLE_DIAMETER_MM = 5
const COURSE_LINE_WIDTH_MM = 0.35

const paperMmToGroundMeters = (mm: number, scale: number) => (mm * scale) / 1000

interface Props {
  info: MapInfo
  image: MapImage
  onControlMoved: (p: LocalPoint) => void
}

export function MapView({ info, image, onControlMoved }: Props) {
  const target = useRef<HTMLDivElement>(null)
  const onControlMovedRef = useRef(onControlMoved)
  onControlMovedRef.current = onControlMoved

  useEffect(() => {
    if (!target.current) return
    const extent = [...info.extent]
    const localFrame = new Projection({ code: 'map-local', units: 'm', extent })
    const [minX, minY, maxX, maxY] = info.extent
    const center = localPoint((minX + maxX) / 2, (minY + maxY) / 2)

    const testControl = new Feature(
      new Circle([...center], paperMmToGroundMeters(CONTROL_CIRCLE_DIAMETER_MM, info.scale) / 2),
    )
    const courseLineWidthMeters = paperMmToGroundMeters(COURSE_LINE_WIDTH_MM, info.scale)

    const map = new OlMap({
      target: target.current,
      layers: [
        new ImageLayer({
          source: new ImageStatic({ url: image.url, imageExtent: extent, projection: localFrame }),
        }),
        new VectorLayer({
          source: new VectorSource({ features: [testControl] }),
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

    const translate = new Translate({ features: new Collection([testControl]) })
    translate.on('translateend', () => {
      const [x = 0, y = 0] = (testControl.getGeometry() as Circle).getCenter()
      onControlMovedRef.current(localPoint(x, y))
    })
    map.addInteraction(translate)
    onControlMovedRef.current(center)

    return () => map.setTarget(undefined)
  }, [info, image])

  return <div ref={target} className="map" />
}
