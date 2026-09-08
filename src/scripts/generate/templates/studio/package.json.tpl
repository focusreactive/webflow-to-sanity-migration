{
  "name": "studio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "sanity dev",
    "build": "sanity build",
    "deploy": "sanity deploy",
    "schema:extract": "sanity schema extract --workspace default",
    "typegen": "sanity schema extract --workspace default && sanity typegen generate",
    "typecheck": "tsc --noEmit",
    "seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "@portabletext/types": "^4.0.2",
    "@sanity/block-tools": "^3.70.0",
    "@sanity/client": "^8.4.0",
    "@sanity/color-input": "^5.0.4",
    "@sanity/vision": "^4.22.1",
    "jsdom": "^28.1.0",
    "react": "^19",
    "react-dom": "^19",
    "sanity": "^4.22.1",
    "styled-components": "^6.1"
  },
  "devDependencies": {
    "@types/jsdom": "^28.0.3",
    "@types/node": "^26.1.0",
    "@types/react": "^19.2.18",
    "tsx": "^4.23.0",
    "typescript": "^5.9.3"
  }
}
