import DOMPurify from "dompurify";
import { marked } from "marked";

export function documentoAHtml(content = "") {
  if (!content) return "";
  const normalizedContent = content
    .replace(/\*\*([^*\n]+)\*\*(?=\S)/g, "**$1** ")
    .replace(/(<\/(?:strong|b)>)(?=\S)/gi, "$1 ");
  const isHtml = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|table|div|img|figure)\b/i.test(normalizedContent);
  const html = isHtml ? normalizedContent : marked.parse(normalizedContent, { async: false });
  return DOMPurify.sanitize(html);
}
