import { z } from 'zod';

export const PlaceLinkSchema = z.object({
  name: z.string(),
  gmapsUrl: z.string().url()
});

export const IdeaSchema = z.object({
  coupleToken: z.string().optional(),
  source: z.enum(['manual','ai']).default('manual'),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const SuggestionSchema = z.object({
  coupleToken: z.string().optional(),
  ideaId: z.string().min(1),
  // mirror idea tags so suggestions carry topic metadata
  tags: z.array(z.string()).optional(),
  startUtc: z.string().refine((s: string) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }),
  endUtc: z.string().refine((s: string) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }),
  titleOverride: z.string().optional(),
  descriptionOverride: z.string().optional(),
  locationOverride: z.string().optional(),
  status: z.enum(['pending','accepted','cancelled']).optional(),
});

export const EventSchema = z.object({
  coupleToken: z.string().optional(),
  uid: z.string().optional(),
  suggestionId: z.string().optional(),
  // events copy tags from the suggestion/idea for analytics
  tags: z.array(z.string()).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startUtc: z.string().refine((s: string) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }),
  endUtc: z.string().refine((s: string) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' }),
  isSurprise: z.boolean().optional(),
});

export type IdeaInput = z.infer<typeof IdeaSchema>;
export type SuggestionInput = z.infer<typeof SuggestionSchema>;
export type EventInput = z.infer<typeof EventSchema>;
