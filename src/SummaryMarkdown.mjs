import { createElement as h } from "react";

// A deliberately small, text-only Markdown renderer. Never inject AI-generated HTML.
function inline(text) {
  return text
    .split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`)/g)
    .map((part, index) => {
      if (part.startsWith("**") || part.startsWith("__"))
        return h("strong", { key: index }, part.slice(2, -2));
      if (part.startsWith("`") && part.endsWith("`"))
        return h("code", { key: index }, part.slice(1, -1));
      return part;
    });
}

export function SummaryMarkdown({ content }) {
  const blocks = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const listItem = (line) => line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (heading) {
      const level =
        heading[1].length <= 2 ? 4 : heading[1].length === 3 ? 5 : 6;
      blocks.push(h(`h${level}`, { key: i }, inline(heading[2])));
      i++;
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}$/.test(line)) {
      blocks.push(h("hr", { key: i++ }));
      continue;
    }
    const first = listItem(line);
    if (first) {
      const ordered = !first[1],
        start = i,
        items = [];
      while (i < lines.length) {
        const item = listItem(lines[i]);
        if (!item || !item[1] !== ordered) break;
        let text = item[2];
        i++;
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]) &&
          !listItem(lines[i])
        )
          text += "\n" + lines[i++].trim();
        items.push(h("li", { key: i }, inline(text)));
      }
      blocks.push(h(ordered ? "ol" : "ul", { key: start }, items));
      continue;
    }
    const start = i,
      paragraph = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*#{1,6}\s/.test(lines[i]) &&
      !listItem(lines[i]) &&
      !/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[i])
    )
      paragraph.push(lines[i++].trim());
    blocks.push(h("p", { key: start }, inline(paragraph.join("\n"))));
  }
  return h("div", { className: "summary-markdown" }, blocks);
}
