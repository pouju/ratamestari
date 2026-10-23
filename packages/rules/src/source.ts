import { z } from 'zod'

export const sourceDocumentSchema = z.enum([
  'ISOM 2017-2',
  'IOF Rules 2026',
  'Lajisäännöt 2026',
  'Ratamestarikirja',
])

export const sourceSchema = z.object({
  document: sourceDocumentSchema,
  section: z.string().min(1),
})

export const citedSchema = z.object({
  sources: z.array(sourceSchema).min(1),
  interpretation: z.boolean(),
})

export type SourceDocument = z.infer<typeof sourceDocumentSchema>
export type Source = z.infer<typeof sourceSchema>
export type Cited = z.infer<typeof citedSchema>

export const isom = (section: string): Source => ({ document: 'ISOM 2017-2', section })
export const iofRules = (section: string): Source => ({ document: 'IOF Rules 2026', section })
export const lajisaannot = (section: string): Source => ({ document: 'Lajisäännöt 2026', section })
export const ratamestarikirja = (section: string): Source => ({
  document: 'Ratamestarikirja',
  section,
})
