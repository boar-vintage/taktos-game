import crypto from 'node:crypto';

export function validateTwilioSignature(input: {
  authToken: string;
  signature: string | undefined;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!input.authToken) {
    return true;
  }

  if (!input.signature) {
    return false;
  }

  const sorted = Object.keys(input.params).sort();
  let base = input.url;
  for (const key of sorted) {
    base += `${key}${input.params[key]}`;
  }

  const computed = crypto.createHmac('sha1', input.authToken).update(base).digest('base64');
  const left = Buffer.from(computed);
  const right = Buffer.from(input.signature);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildTwimlMessage(message: string | null): string {
  if (!message) {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}
