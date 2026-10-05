import DOMPurify from "dompurify";
import { marked } from "marked";

export function documentoAHtml(content = "") {
  if (!content) return "";
  const isHtml = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|table|div|img|figure)\b/i.test(content);
  const html = isHtml ? content : marked.parse(content, { async: false });
  return DOMPurify.sanitize(html);
}
