# Car rental app

## Web app

Mobile-first React + Vite + Tailwind v4 app (installable PWA) with a staff dashboard and a Supabase backend.

- `npm run dev` — app on http://localhost:3000. Without Supabase keys it runs in **demo mode**: data is stored on the device, payments and emails/SMS are simulated, and you're signed in as a demo admin so `/admin` works. Open the dashboard in a second tab to see changes sync live.
- To go live on Supabase (Paystack payments, email/SMS/push, real accounts): [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
- `npm run test:db` replays all database migrations in an in-memory Postgres and checks the booking lifecycle; `npm run lint` type-checks the app and the legacy API.
- Deploying as a static site needs an SPA fallback (included for Vercel in `vercel.json`).

### What's in it

| Area | Customer app | Staff dashboard (`/admin`) |
| --- | --- | --- |
| Online reservations | Search by hub and dates, daily or hourly pricing, add-ons, promo codes | Booking queue: approve, decline with a reason, start, complete |
| Live availability & calendar | Booked cars hidden for your dates, month calendar per car, live re-check before checkout | 14-day fleet calendar, in/out of service, maintenance blocks |
| Pricing | Standard daily and hourly rates, plus fixed-price packages (weekend specials, red-carpet/wedding blocks, weekly rates) with what's included | Create packages per car with templates; flags prices far below the standard rate; promo codes never stack on packages |
| Payment processing | Paystack hosted checkout (card, transfer, USSD), verified server-side | Payment status, mark paid (cash or transfer) |
| Digital rental agreements | Read, type name, draw signature; printable / save as PDF | A trip can't start until it's signed and paid |
| Customer communication | Chat with the team; email/SMS confirmations and reminders; push notifications | Inbox, automated message log |
| Customer screening | Verify before booking: licence (both sides), government ID, selfie, employment or company, 5-year driving record, date of birth (25+) | Verification queue with documents, per-check approve/reject with reasons; bookings can't be confirmed until verified; expiry tracked daily |
| Security deposits | Refundable deposit per car, paid before pick-up; status and any amount kept shown on the booking | Trip can't start without a held deposit; release in full or keep part with a stated reason, refunded via Paystack |
| Customer data | Account, licence details, booking history, SMS opt-in | Customer list, licence verification, notes, block |
| Listings | Rules, photos and reviews on each car | Add/edit cars: photos, pricing, specs, rules, availability |
| Reviews & repeat business | Rate completed trips (request sent 2 h after return); loyalty tiers with free add-ons and service perks, never lower rates; one-tap "Book again" | Experience tab: rating, review rate, repeat-customer rate; follow-up queue for ratings of 3★ or less; public replies; hide/publish |

### Code map

- `src/lib/backend/` — the single data layer: `local.ts` (demo) and `supabase.ts` (production) implement the interface in `types.ts`.
- `src/lib/` — pricing, dates, filters, rental agreement text, push notifications.
- `src/state/AppState.tsx` — app state; `src/components/screens/` — customer pages; `src/components/admin/` — staff dashboard.
- `supabase/migrations/` — schema, security (RLS), booking functions, automation; `supabase/functions/` — Paystack and notification Edge Functions.
- Routes: `/`, `/explore`, `/cars/:id`, `/cars/:id/book`, `/checkout`, `/bookings`, `/bookings/:id`, `/bookings/:id/agreement`, `/messages`, `/signin`, `/favorites`, `/profile`, `/admin`.
- Static car photos live in `public/images/`; app icons and the web manifest in `public/`.
- Fleet photos: the current photos are licensed stand-ins (credited on each car page). Shoot your own with [docs/PHOTO_GUIDE.md](docs/PHOTO_GUIDE.md) and upload them in Staff dashboard → Vehicles.
- Store listing details (category Travel, English, age rating U): [docs/STORE_LISTING.md](docs/STORE_LISTING.md).

## Legacy staff and fleet API (Express)

Superseded by Supabase and kept for reference. In demo mode the app still uses it for cars and new bookings when it's running.

The Express API uses Node.js 24 and SQLite. On first run it seeds the demo fleet and bookings from the app. It creates the initial administrator from environment variables; no default password is built into the project.

1. Copy `.env.example` to `.env`.
2. Set a unique `BOOTSTRAP_ADMIN_EMAIL`, a strong `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters), and a random `GPS_WEBHOOK_SECRET`.
3. In one terminal run `npm run server`; in another run `npm run dev`.

The API listens on `127.0.0.1:4000` by default. The Vite development server proxies `/api` and `/uploads` to it. SQLite data and uploaded images are stored under `data/`, which is ignored by Git. Use HTTPS and a protected network when exposing the API outside local development.

### Roles

- **Admin:** manage staff, managers, vehicles, uploads, bookings, and activity history.
- **Manager:** manage staff accounts, vehicles, uploads, bookings, and activity history. Managers can create staff accounts but cannot create or promote managers.
- **Staff:** review bookings, advance booking status, update vehicle availability, and view the dashboard and latest vehicle locations.

All management routes require a bearer token from `POST /api/auth/login`. Tokens expire after eight hours. Passwords are stored as salted scrypt hashes.

### Main endpoints

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Health check |
| `GET /api/cars` | Public | List vehicles marked available |
| `POST /api/bookings` | Public | Create a pending booking; the server calculates prices |
| `GET /api/bookings/:id/status` | Public with matching `X-Booking-Email` | Check a customer's booking status |
| `POST /api/auth/login` | Public | Sign in |
| `GET /api/auth/me` | Signed in | Read current staff account |
| `POST /api/auth/logout` | Signed in | Revoke current token |
| `GET /api/management/dashboard` | Signed in | Booking and fleet counts |
| `GET, POST /api/management/staff` | Admin/manager | List and create staff accounts |
| `PATCH /api/management/staff/:id` | Admin/manager | Update staff name, role, or active status |
| `GET, POST /api/management/cars` | Signed in for GET; admin/manager for POST | List or add vehicles |
| `PATCH /api/management/cars/:id` | Admin/manager | Edit vehicle details |
| `PATCH /api/management/cars/:id/availability` | Signed in | Mark a vehicle available/unavailable |
| `POST /api/management/cars/images` | Admin/manager | Upload JPEG, PNG, or WebP (up to 5 MB) as the raw request body |
| `GET /api/management/bookings` | Signed in | Review bookings; supports `status`, `limit`, and `offset` |
| `PATCH /api/management/bookings/:id/status` | Signed in | Confirm, activate, complete, or cancel a booking |
| `GET /api/management/activity` | Admin/manager | Review the staff action log |
| `GET /api/management/locations` | Signed in | Read the latest known location for each vehicle |
| `POST /api/integrations/gps/locations` | GPS webhook secret | Ingest a vehicle location |

Booking status transitions are `pending → confirmed → active → completed`; pending, confirmed, or active bookings can also be cancelled. Confirmation checks the vehicle's availability and overlapping reservations using the selected pickup/return times.

Bookings can use a full-day rate or a fixed hourly rate. Hourly bookings use the existing pickup and return date/time fields, require at least one billable hour, and round partial hours up. Existing daily add-on rates are prorated over 24 hours for hourly bookings. The four seeded cars have a daily rate of ₦800,000:

| Vehicle | Hourly rate |
| --- | ---: |
| Audi R8 V10 Performance | ₦150,000 |
| Range Rover Autobiography | ₦180,000 |
| BMW M4 Competition | ₦200,000 |
| Mercedes-AMG G63 | ₦200,000 |

New cars added through the management API must include both `pricePerDay` and `pricePerHour`.

The app's payment UI is still a demo and does not charge a payment method. A completed checkout records a pending booking for staff review.
This addition provides a REST API; it does not add a staff web dashboard.

### GPS integration status

The API stores authenticated location updates and exposes the latest coordinates to staff. No GPS vendor or device details were provided, so a vendor-specific adapter/webhook mapping is not configured yet. A provider must send JSON with `carId`, `latitude`, and `longitude` to `POST /api/integrations/gps/locations`, with the configured `X-GPS-Webhook-Secret` header. The generic ingestion endpoint alone cannot obtain live coordinates from vehicles.

Run the API checks with `npm run test:server`; `npm run lint` type-checks both the frontend and API.
