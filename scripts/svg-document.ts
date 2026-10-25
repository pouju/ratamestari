import { DOMImplementation } from 'xmldom'

// A document to render map SVG into outside the browser. ocad2geojson sets pattern ids as a DOM
// property, which xmldom does not serialise, so ids are kept as attributes; otherwise hatched and
// structured areas (marsh, scattered trees, …) lose their fill.
export function svgDocument(): Document {
  const document = new DOMImplementation().createDocument(null, 'svg', null) as unknown as Document
  const elementPrototype = Object.getPrototypeOf(document.createElement('g')) as object
  if (!Object.getOwnPropertyDescriptor(elementPrototype, 'id')) {
    Object.defineProperty(elementPrototype, 'id', {
      get(this: Element) {
        return this.getAttribute('id') ?? ''
      },
      set(this: Element, id: string) {
        this.setAttribute('id', id)
      },
    })
  }
  return document
}
