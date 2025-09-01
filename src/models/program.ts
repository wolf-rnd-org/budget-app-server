import { z } from "zod";

export const ProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
  budget: z.number(),
  extra_budget: z.number().optional().default(0),
  year: z.number().optional(),
});

export type Program = z.infer<typeof ProgramSchema>;
