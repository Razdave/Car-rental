# Car rental app

## Staff and fleet API

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

Booking status transitions are `pending → confirmed → active → completed`; pending, confirmed, or active bookings can also be cancelled. Confirmation checks the vehicle's availability and overlapping reservations.

The app's payment UI is still a demo and does not charge a payment method. A completed checkout records a pending booking for staff review.
This addition provides a REST API; it does not add a staff web dashboard.

### GPS integration status

The API stores authenticated location updates and exposes the latest coordinates to staff. No GPS vendor or device details were provided, so a vendor-specific adapter/webhook mapping is not configured yet. A provider must send JSON with `carId`, `latitude`, and `longitude` to `POST /api/integrations/gps/locations`, with the configured `X-GPS-Webhook-Secret` header. The generic ingestion endpoint alone cannot obtain live coordinates from vehicles.

Run the API checks with `npm run test:server`; `npm run lint` type-checks both the frontend and API.
