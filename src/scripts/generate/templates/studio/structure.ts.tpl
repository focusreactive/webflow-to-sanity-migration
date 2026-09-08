import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Pages")
        .child(S.documentTypeList("page").title("Pages")),
      S.divider(),
      S.listItem()
        .title("Content")
        .child(
          S.list()
            .title("Content")
            .items([
__CONTENT_ITEMS__
            ]),
        ),
      S.listItem()
        .title("Site")
        .child(
          S.list()
            .title("Site")
            .items([
__SITE_ITEMS__
            ]),
        ),
    ]);
