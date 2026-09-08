import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export const DELIVERABLE_SRC_DIR = join(moduleDir, "deliverable");

export const APP_DIRS = ["studio", "web"] as const;

export const NEVER_REMOVED = ["studio/.env", "web/.env.local"] as const;
