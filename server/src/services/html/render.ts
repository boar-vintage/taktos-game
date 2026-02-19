function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function e(input: unknown): string {
  return escapeHtml(String(input ?? ''));
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(title)}</title>
</head>
<body>
${body}
</body>
</html>`;
}

export function link(href: string, text: string): string {
  return `<a href="${e(href)}">${e(text)}</a>`;
}

export function page(title: string, parts: string[]): string {
  return layout(title, parts.filter(Boolean).join('\n'));
}
