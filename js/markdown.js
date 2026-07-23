// A tiny renderer for the specific markdown subset actually used in
// data/practical-info.json (### headings, "- " bullet lists, **bold**,
// [text](url) links, *italics*, blank-line-separated paragraphs) — not a
// general CommonMark parser, since the content is fixed and fully known
// ahead of time rather than user-authored.
import { escapeHtml } from "./util.js";

export function renderMarkdown(raw) {
  return raw
    .split(/\n\n+/)
    .map(renderBlock)
    .join("");
}

function renderBlock(block) {
  const lines = block.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      html += `<h3>${inline(line.slice(4))}</h3>`;
      i++;
      continue;
    }

    if (line.trim().startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(`<li>${inline(lines[i].trim().slice(2))}</li>`);
        i++;
      }
      html += `<ul>${items.join("")}</ul>`;
      continue;
    }

    const para = [];
    while (i < lines.length && !lines[i].trim().startsWith("- ") && !lines[i].startsWith("### ")) {
      para.push(inline(lines[i]));
      i++;
    }
    html += `<p>${para.join("<br>")}</p>`;
  }

  return html;
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return s;
}
