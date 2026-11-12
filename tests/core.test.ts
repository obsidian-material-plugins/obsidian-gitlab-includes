import { describe, expect, it } from "vitest";
import { findIncludes, parseDirective } from "../src/include-parser";
import { isRepresentablePath, relativePath, resolvePath } from "../src/path-resolver";
import { conversions } from "../src/conversion";

describe("GitLab directives", () => {
  it("parses standalone lines and preserves paths verbatim", () => {
    expect(parseDirective("::include{file=kansio/tiedosto kansiossa.md}")).toBe("kansio/tiedosto kansiossa.md");
    expect(parseDirective("::include{file=Ä! #?.md}")).toBe("Ä! #?.md");
    expect(parseDirective(" ::include{file=a.md}")).toBeNull();
    expect(parseDirective("::include{file=}")).toBeNull();
    expect(parseDirective("::include{file=a.md} ")).toBeNull();
    expect(parseDirective("::include{file=a.md")).toBeNull();
  });
  it("finds multiple directives but excludes fenced examples and handles CRLF", () => {
    const text = "::include{file=a.md}\r\n```md\r\n::include{file=b.md}\r\n```\r\n~~~\n::include{file=c.md}\n~~~\n::include{file=d.md}";
    expect(findIncludes(text).map(x => x.path)).toEqual(["a.md", "d.md"]);
    for (const include of findIncludes(text)) expect(text.slice(include.from, include.to)).toBe(`::include{file=${include.path}}`);
  });
});

describe("relative paths", () => {
  it("resolves relative to the containing file without escaping the vault", () => {
    expect(resolvePath("docs/tutorials/index.md", "../reference/api.md")).toBe("docs/reference/api.md");
    expect(resolvePath("docs/index.md", "./kansio/tiedosto kansiossa.md")).toBe("docs/kansio/tiedosto kansiossa.md");
    expect(resolvePath("docs/Ä.md", "Ä.md")).toBe("docs/Ä.md");
    expect(resolvePath("docs/Ä.md", "ä.md")).toBe("docs/ä.md");
    expect(resolvePath("docs/index.md", "../../secret.md")).toBeNull();
    expect(resolvePath("docs/index.md", "https://example.com/a.md")).toBeNull();
    expect(resolvePath("docs/index.md", "/a.md")).toBeNull();
    expect(relativePath("docs/tutorials/index.md", "docs/reference/api.md")).toBe("../reference/api.md");
    expect(relativePath("docs/index.md", "docs/index.md")).toBe("index.md");
    expect(isRepresentablePath("a # b.md")).toBe(true);
  });
});

describe("explicit conversion", () => {
  const files: Record<string, string> = {
    chapter: "docs/chapter.md",
    "dir/name with spaces": "docs/dir/name with spaces.md",
    image: "docs/image.png",
    pdf: "docs/pdf.pdf"
  };
  const resolve = (link: string) => files[link] ?? null;
  it("changes only supported standalone note embeds", () => {
    const input = [
      "before [ordinary](chapter.md)", "![[chapter]]", "![[dir/name with spaces]]",
      "![[image]]", "![[pdf]]", "![[chapter#heading]]", "![[chapter|alias]]",
      "inline ![[chapter]] text", "```md", "![[chapter]]", "```", "after"
    ].join("\n");
    const result = conversions(input, "docs/index.md", resolve);
    expect(result.changes).toHaveLength(2);
    let output = input;
    for (const change of result.changes.slice().reverse()) output = output.slice(0, change.from) + change.text + output.slice(change.to);
    expect(output).toBe(input.replace("![[chapter]]", "::include{file=chapter.md}")
      .replace("![[dir/name with spaces]]", "::include{file=dir/name with spaces.md}"));
    expect(result.skipped).toBe(4);
  });
  it("leaves missing and case-mismatched names unchanged", () => {
    expect(conversions("![[Chapter]]", "docs/index.md", resolve).changes).toEqual([]);
  });
});
