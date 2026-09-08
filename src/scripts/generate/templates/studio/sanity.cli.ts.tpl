import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: "__PROJECT_ID__",
    dataset: "__DATASET__",
  },
  typegen: {
    schema: "schema.json",
    path: "../web/src/**/*.{ts,tsx}",
    generates: "../web/sanity.types.ts",
  },
});
