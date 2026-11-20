# App store listing

Details for publishing Aurevon to app stores (Google Play via a Trusted Web Activity, the Microsoft Store via PWABuilder,
or the Apple App Store via a native wrapper).

| Field | Value |
| --- | --- |
| App name | Aurevon — Premium Car Rental |
| Short name | Aurevon |
| Category | Travel |
| Age rating | U (Universal) — no objectionable content; contains in-app purchases (car rental payments) |
| Language | English |
| Listed size | 43.3 MB |
| Package / start URL | `/` |
| Orientation | Portrait |
| Theme colour | `#080808` |

The language (`lang: "en"`) and category (`categories: ["travel"]`) are also declared in `public/manifest.webmanifest`.
The age rating isn't part of the web manifest — each store issues it from its own content questionnaire (IARC on Google Play
and the Microsoft Store), so answer the questionnaire to get the U / "Everyone" rating rather than entering it by hand.

The 43.3 MB listed size is the value supplied for the listing. The web build itself is much smaller (about 0.7 MB of code
plus car photos); the store package size depends on the wrapper used.

## Short description (80 characters)

Rent premium cars by the day or hour. Book, sign, pay and chat in one app.

## Full description

Aurevon makes renting a premium car simple.

- **Live availability** — see exactly which days each car is free, updated in real time.
- **Book in minutes** — choose daily or hourly rental, pick-up and return hubs, and add-ons like full damage protection.
- **Secure payment** — pay by card, bank transfer or USSD through Paystack.
- **Digital rental agreement** — read and sign on your phone before pick-up; keep a copy any time.
- **Stay in the loop** — confirmations, pick-up reminders and updates by email, SMS and push notification.
- **Chat with our team** — ask about delivery, timing or the car right in the app.
- **Reviews** — read honest reviews from drivers who rented each car, and leave your own after your trip.

## Assets checklist

- Icons: `public/icons/icon-512.png`, `maskable-512.png`, `icon-192.png`, `apple-touch-icon.png` (source: `icon.svg`).
- Screenshots: phone (1080×1920) of Home, car details with calendar, booking, agreement and trips; tablet/desktop optional.
- Privacy policy URL and support email (required by every store).
