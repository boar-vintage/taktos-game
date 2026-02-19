# SMS Client (Twilio)

This repo includes an invite-only SMS client on the same backend as the terminal app.

## Environment

Add these to `server/.env`:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
SMS_MAX_INBOUND_PER_DAY=30
SMS_MAX_OUTBOUND_PER_DAY=30
SMS_BURST_LIMIT_PER_SEC=1
SMS_SUPPORT_URL=https://example.local/support
SMS_UNLOCK_BASE_URL=https://example.local
```

Notes:
- If `TWILIO_AUTH_TOKEN` is set, `/sms/inbound` validates `X-Twilio-Signature`.
- Leave `TWILIO_AUTH_TOKEN` empty for local webhook testing without signature checks.

## Twilio Console Setup

1. Buy/choose an SMS-capable Twilio number.
2. In Twilio number settings, set **A message comes in** webhook to:
   - `https://<your-host>/sms/inbound`
   - Method: `POST`
3. Set your server env to match the Twilio account/number.

## Local Testing

You can use any public tunnel for local dev (for example ngrok), but tunneling is optional.

Example with ngrok:

```bash
ngrok http 4000
```

Set Twilio inbound webhook to:

```text
https://<ngrok-id>.ngrok.io/sms/inbound
```

## Invite-Only Flow

1. Create an admin user via API signup/login.
2. Create invite code:

```bash
curl -X POST http://localhost:4000/admin/sms/invites \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"max_uses":1,"expires_in_days":7}'
```

3. (Optional) Pre-allowlist a number:

```bash
curl -X POST http://localhost:4000/admin/sms/allowlist \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"phone_e164":"+15551234567","status":"invited"}'
```

4. From the invited number, text:

```text
JOIN <CODE>
```

5. Continue with menu commands:

```text
MAP
ENTER 1
JOBS
SAY hi
UNLOCK 1
```

## Compliance

Supported compliance keywords:
- STOP variants: `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`
- START variants: `START`, `UNSTOP`
- HELP variants: `HELP`, `INFO`

## Cost Controls

- Daily caps by phone (`sms_usage_daily`):
  - `SMS_MAX_INBOUND_PER_DAY` (default 30)
  - `SMS_MAX_OUTBOUND_PER_DAY` (default 30)
- Burst limit (`sms_burst_limits`): `SMS_BURST_LIMIT_PER_SEC` (default 1)

Daily usage query:

```bash
curl "http://localhost:4000/admin/sms/usage?day=2026-02-19" \
  -H "Authorization: Bearer <ADMIN_JWT>"
```
