import { colorInput } from "@sanity/color-input";
import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { presentationTool } from "sanity/presentation";
import { structureTool } from "sanity/structure";

import { resolve } from "./src/presentation/resolve";
import { schemaTypes } from "./src/schemaTypes";
import { structure } from "./src/structure";

export default defineConfig({
  name: "default",
  title: "__TITLE__",
  projectId: "__PROJECT_ID__",
  dataset: "__DATASET__",
  plugins: [
    structureTool({ structure }),
    presentationTool({
      resolve,
      previewUrl: {
        origin: process.env.SANITY_STUDIO_PREVIEW_ORIGIN ?? "http://localhost:3000",
        preview: "/",
        draftMode: { enable: "/api/draft-mode/enable" },
      },
    }),
    colorInput(),
    visionTool(),
  ],
  schema: { types: schemaTypes },
});
