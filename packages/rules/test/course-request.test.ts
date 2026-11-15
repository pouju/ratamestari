import { describe, expect, it } from 'vitest'
import {
  classFromCourseName,
  courseRequestSchema,
  courseTargetFor,
  courseTargetSchema,
  openCourseRequestSchema,
  openCourseTargetFor,
  type CourseRequest,
  type OpenCourseRequest,
} from '../src/course-request'

const request = (overrides: Partial<CourseRequest> = {}): CourseRequest =>
  courseRequestSchema.parse({
    eventLevel: 'finnishChampionship',
    format: 'long',
    sex: 'H',
    ageClass: 21,
    ...overrides,
  })

describe('courseRequestSchema', () => {
  it('defaults to the A level', () => {
    expect(request().skillLetter).toBe('A')
  })

  it('rejects classes that do not exist', () => {
    expect(() => courseRequestSchema.parse({ ...request(), ageClass: 22 })).toThrow()
    expect(() => courseRequestSchema.parse({ ...request(), sex: 'M' })).toThrow()
  })

  it('holds no coordinates, since the request comes from the LLM', () => {
    expect(Object.keys(courseRequestSchema.shape)).toEqual([
      'eventLevel',
      'format',
      'sex',
      'ageClass',
      'skillLetter',
    ])
  })
})

describe('courseTargetFor', () => {
  it('sets an SM long distance H21 course for 90 minutes at the black level', () => {
    const target = courseTargetFor(request())!
    expect(target.winningTime.targetMinutes).toBe(90)
    expect(target.skillColour).toBe('black')
    expect(target.siteDifficulty).toEqual([3, 5])
    expect(() => courseTargetSchema.parse(target)).not.toThrow()
  })

  it('uses the SSL colour levels for young classes', () => {
    const colourOf = (ageClass: CourseRequest['ageClass']) =>
      courseTargetFor(request({ eventLevel: 'national', ageClass }))!.skillColour
    expect(colourOf(10)).toBe('white')
    expect(colourOf(12)).toBe('yellow')
    expect(colourOf(14)).toBe('orange')
    expect(colourOf(16)).toBe('purple')
    expect(colourOf(18)).toBe('blue')
  })

  it('makes B and C classes shorter and easier', () => {
    const a = courseTargetFor(request({ eventLevel: 'national' }))!
    const b = courseTargetFor(request({ eventLevel: 'national', skillLetter: 'B' }))!
    const c = courseTargetFor(request({ eventLevel: 'national', skillLetter: 'C' }))!
    expect(b.winningTime.targetMinutes).toBeLessThan(a.winningTime.targetMinutes)
    expect(b.siteDifficulty[1]).toBeLessThan(a.siteDifficulty[1])
    expect(c.skillColour).toBe('yellow')
    expect(b.sources).toContainEqual({ document: 'Lajisäännöt 2026', section: '11.251' })
  })

  it('returns null when the event has no winning time for the class', () => {
    expect(courseTargetFor(request({ ageClass: 12 }))).toBeNull()
  })
})

describe('classFromCourseName', () => {
  it('reads the class from usual course names', () => {
    expect(classFromCourseName('H21')).toEqual({ sex: 'H', ageClass: 21, skillLetter: 'A' })
    expect(classFromCourseName('D16B')).toEqual({ sex: 'D', ageClass: 16, skillLetter: 'B' })
    expect(classFromCourseName('Rata 3 M45')).toEqual({ sex: 'H', ageClass: 45, skillLetter: 'A' })
    expect(classFromCourseName('W 35')).toEqual({ sex: 'D', ageClass: 35, skillLetter: 'A' })
  })

  it('gives no class when the name holds none', () => {
    expect(classFromCourseName('Rata 3')).toBeNull()
    expect(classFromCourseName('H22')).toBeNull()
    expect(classFromCourseName('Helppo')).toBeNull()
  })
})

describe('openCourseTargetFor', () => {
  const open = (overrides: Partial<OpenCourseRequest> = {}): OpenCourseRequest =>
    openCourseRequestSchema.parse({
      kind: 'open',
      format: 'long',
      skillColour: 'blue',
      lengthKm: { min: 5, max: 7 },
      ...overrides,
    })

  it("turns the length into time at the event's pace", () => {
    const target = openCourseTargetFor(open(), 6 * 60)
    expect(target.winningTime).toEqual({ minMinutes: 30, maxMinutes: 42, targetMinutes: 36 })
    expect(() => courseTargetSchema.parse(target)).not.toThrow()
  })

  it("uses the colour's control-site difficulty, as for a class of that colour", () => {
    expect(openCourseTargetFor(open({ skillColour: 'white' }), 360).siteDifficulty).toEqual([1, 1])
    expect(openCourseTargetFor(open({ skillColour: 'orange' }), 360).siteDifficulty).toEqual([2, 3])
    expect(openCourseTargetFor(open(), 360).siteDifficulty).toEqual(
      courseTargetFor(request({ eventLevel: 'national', ageClass: 18 }))!.siteDifficulty,
    )
  })

  it('rejects a length range that runs backwards', () => {
    expect(() => open({ lengthKm: { min: 7, max: 5 } })).toThrow()
  })
})
