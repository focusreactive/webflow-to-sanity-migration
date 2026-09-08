import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { AssetFile } from "#synth/steps/input-build/utils/media-input.ts";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

function shaFromRequestPath(url: string | undefined): string {
  const requested = decodeURIComponent((url ?? "").split("?")[0] ?? "");
  return requested.replace(/^\//, "").replace(/\.[^./]*$/, "");
}

export function createAssetHandler(pathBySha: ReadonlyMap<string, AssetFile>) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const file = pathBySha.get(shaFromRequestPath(req.url));
    if (file === undefined || !existsSync(file.path)) {
      res.writeHead(HTTP_NOT_FOUND).end();
      return;
    }
    res.writeHead(HTTP_OK, file.contentType === undefined ? {} : { "content-type": file.contentType });
    createReadStream(file.path).pipe(res);
  };
}
