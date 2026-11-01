# Account recovery and business email

[Project overview](../README.md) · [Security policy](../SECURITY.md) · [API reference](../API_DOCUMENTATION.md)

Password recovery uses the backend's Zoho CPaaS transactional email integration. Its configuration is separate from the mailbox staff use to read and send business email. See the [email adapter](../backend/utils/transactionalEmail.js) and [environment template](../backend/.env.example).

## Configure the account and sender

1. Make sure the administrator's business mailbox can receive email.
2. As a Super Admin, update the account email in **Admins** to that mailbox. Existing account addresses are not changed automatically.
3. Configure a transactional email Agent and verified sender in the provider account. Use its Send API key and regional API endpoint for the backend settings below.
4. Restart the backend after changing its environment.

| Backend variable | Value |
| --- | --- |
| `ZOHO_CPaaS_API_KEY` | The Agent's Send API key, without the `Zoho-enczapikey` prefix; the adapter adds it. |
| `ZOHO_CPaaS_FROM` | The verified sending address, such as `admin@dreamceylonjourneys.com`. |
| `ZOHO_CPaaS_API_URL` | The Agent's regional HTTPS `/v1.1/email` endpoint. The adapter defaults to `https://cpaas.zoho.com/v1.1/email`. |

Keep the API key in the backend environment. The frontend needs only the API base URL.

## Reset flow

1. Choose **Forgot your password?** on the sign-in page and enter the account email.
2. Enter the six-digit code. It lasts 10 minutes, can be resent after 60 seconds, and is invalidated after five incorrect attempts.
3. After verification, set a new password within 10 minutes. The password must contain at least 12 characters and at most 72 UTF-8 bytes.

Successful reset consumes the reset token and ends prior login sessions. A Super Admin can also reset another administrator's password through **Admins**.

| Step | Endpoint | JSON body |
| --- | --- | --- |
| Request code | `POST /api/auth/forgot-password` | `{ "email": "admin@example.com" }` |
| Verify code | `POST /api/auth/verify-reset-code` | `{ "email": "admin@example.com", "code": "123456" }` |
| Change password | `POST /api/auth/reset-password` | `{ "email": "admin@example.com", "resetToken": "...", "password": "..." }` |

## Delivery troubleshooting

- **Service unavailable:** missing transactional email configuration returns HTTP 503. Check the backend environment and restart the API.
- **Confirmation but no email:** the request uses the same confirmation for known and unknown addresses. Confirm the account is Active and the email in **Admins** matches the address entered.
- **Resend not available:** wait for the one-minute cooldown before requesting another code.
- **Provider accepted the request:** check the Agent's delivery/bounce records and the mailbox's Spam folder. Acceptance by the provider is not confirmation of inbox delivery.
- **Delivery failed:** the backend logs the HTTP status and provider error code. Review the Agent key, sending-domain verification, sender restrictions and regional endpoint. Use a live sending configuration for real recipients.

The adapter and [password reset controller](../backend/controllers/passwordResetController.js) define the supported behavior. Provider configuration must be completed before email recovery can work.
