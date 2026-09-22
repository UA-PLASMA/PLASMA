import { marked } from "marked";

export function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(value);
}

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true });
}

export function toDisplayLabel(value: string): string {
  return value.replace(/(^|\s|-)\S/g, (letter) => letter.toUpperCase());
}
