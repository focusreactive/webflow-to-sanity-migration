import { z } from "zod";

export const runConfigSchema = z.strictObject({
  sourceUrl: z.url(),
  projectName: z.string().min(1),
  workspacePath: z.string(),
  target: z.strictObject({
    projectId: z.string().min(1),
    dataset: z.string().min(1).default("production"),
  }),
});

export type RunConfig = z.infer<typeof runConfigSchema>;
