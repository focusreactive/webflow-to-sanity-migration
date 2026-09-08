export const SYNTH_RICHTEXT_DIR = "richtext";

function pascalCase(name: string): string {
  return name
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function synthRichTextComponentName(name: string): string {
  return `RichText${pascalCase(name)}`;
}

export function synthRichTextWrapperPath(name: string): string {
  return `${SYNTH_RICHTEXT_DIR}/${name}.tsx`;
}

export function synthRichTextWrapperImport(name: string): string {
  return `./${SYNTH_RICHTEXT_DIR}/${name}`;
}

export function synthRichTextImportPattern(): RegExp {
  return new RegExp(String.raw`(from\s+["'])\./${SYNTH_RICHTEXT_DIR}/([^"'/]+?)(?:\.tsx?)?(["'])`, "g");
}
