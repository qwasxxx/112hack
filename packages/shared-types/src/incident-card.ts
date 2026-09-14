import { z } from 'zod';

export const IncidentFieldType = z.enum([
  'string',
  'text',
  'number',
  'enum',
  'boolean',
  'datetime',
  'address',
  'phone',
  'coordinates',
]);
export type IncidentFieldType = z.infer<typeof IncidentFieldType>;

export const FieldMatchRule = z.enum(['exact', 'fuzzy', 'required_present', 'against_fact']);

export const incidentCardFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: IncidentFieldType,
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  dependsOn: z.string().optional(),
  section: z.string().default('main'),
  evaluation: z
    .object({
      weight: z.number().default(1),
      match: FieldMatchRule,
      factId: z.string().optional(),
    })
    .optional(),
});
export type IncidentCardField = z.infer<typeof incidentCardFieldSchema>;

export const incidentCardSchemaSchema = z.object({
  schemaVersion: z.string().min(1),
  title: z.string().min(1),
  fields: z.array(incidentCardFieldSchema).min(1),
});
export type IncidentCardSchema = z.infer<typeof incidentCardSchemaSchema>;

export const incidentCardValuesSchema = z.record(z.unknown());
export type IncidentCardValues = z.infer<typeof incidentCardValuesSchema>;

export interface IncidentCard {
  callId: string;
  schemaVersion: string;
  values: IncidentCardValues;
  version: number;
  updatedAt: string;
}
