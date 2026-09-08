import { emitLayout } from "#generate/steps/scaffold/layout.ts";

const OPTS = {
  lang: "en",
  siteTitle: "nova-x.webflow.io",
  globals: [{ name: "header" }, { name: "footer" }],
};

describe("emitLayout", () => {
  it("titles the document and sets the html lang", () => {
    const source = emitLayout(OPTS);

    expect(source).toContain('title: "nova-x.webflow.io",');
    expect(source).toContain('<html lang="en">');
  });

  it("imports globals.css so tailwind and the theme reach every route", () => {
    expect(emitLayout(OPTS)).toContain('import "./globals.css";');
  });

  it("renders the header before children and the footer after them", () => {
    const source = emitLayout(OPTS);

    expect(source.indexOf("<Header")).toBeLessThan(source.indexOf("{children}"));
    expect(source.indexOf("{children}")).toBeLessThan(source.indexOf("<Footer"));
  });

  it("fetches every chrome document in one Promise.all", () => {
    const source = emitLayout(OPTS);

    expect(source).toContain("const [{ data: header }, { data: footer }] = await Promise.all([");
    expect(source).toContain("sanityFetch({ query: HEADER_QUERY }),");
    expect(source).toContain("sanityFetch({ query: FOOTER_QUERY }),");
  });

  it("imports each chrome component and its props type from the emitted component dir", () => {
    const source = emitLayout(OPTS);

    expect(source).toContain('import Header from "@/components/chrome/header";');
    expect(source).toContain('import type { HeaderProps } from "@/components/chrome/header/props";');
  });

  it("mounts SanityLive and gates VisualEditing on draft mode", () => {
    const source = emitLayout(OPTS);

    expect(source).toContain("<SanityLive />");
    expect(source).toContain("{isEnabled && <VisualEditing />}");
    expect(source).toContain("const { isEnabled } = await draftMode();");
  });

  it("omits the chrome fetch entirely when the IR has no globals", () => {
    const source = emitLayout({ ...OPTS, globals: [] });

    expect(source).toContain('import { SanityLive } from "@/sanity/live";');
    expect(source).not.toContain("Promise.all");
    expect(source).not.toContain("@/sanity/queries");
  });

  it("places an unknown chrome role before the children", () => {
    const source = emitLayout({ ...OPTS, globals: [{ name: "announcement-bar" }] });

    expect(source).toContain('import AnnouncementBar from "@/components/chrome/announcement-bar";');
    expect(source.indexOf("<AnnouncementBar")).toBeLessThan(source.indexOf("{children}"));
    expect(source).toContain("sanityFetch({ query: ANNOUNCEMENT_BAR_QUERY }),");
  });
});
