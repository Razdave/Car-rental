import 'dotenv/config';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { CARS_DATA, INITIAL_BOOKINGS, INITIAL_EXTRA_SERVICES } from '../src/data/cars.ts';
import type { Booking, Car } from '../src/types/car.ts';

type Role = 'admin' | 'manager' | 'staff';
type BookingStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
type DurationUnit = 'day' | 'hour';
type AuthUser = { id: string; name: string; email: string; role: Role };
type AuthRequest = Request & { authUser?: AuthUser };

interface ServerOptions {
  databasePath?: string;
  uploadDir?: string;
  gpsWebhookSecret?: string;
  bootstrapAdmin?: { email: string; password: string; name?: string };
}

interface DatabaseCarRow {
  id: string;
  is_available: number;
  details_json: string;
}

interface DatabaseBookingRow {
  id: string;
  status: BookingStatus;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const isBookingStatus = (value: unknown): value is BookingStatus =>
  value === 'pending' ||
  value === 'confirmed' ||
  value === 'active' ||
  value === 'completed' ||
  value === 'cancelled';

const hashPassword = (password: string): string => {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
};

const verifyPassword = (password: string, storedHash: string): boolean => {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const bookingClientStatus = (status: BookingStatus): Booking['status'] => {
  if (status === 'pending' || status === 'confirmed') return 'upcoming';
  return status;
};

const isDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(value);

const getDateTimeMinutes = (date: string, time: string): number | null => {
  if (!isDate(date) || !isTime(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const match = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0);
  return Date.UTC(year, month - 1, day, hour, Number(match[2])) / 60000;
};

const toSortableDateTime = (date: string, time: string): string | null => {
  const minutes = getDateTimeMinutes(date, time);
  if (minutes === null) return null;
  const [year, month, day] = date.split('-').map(Number);
  const dateTime = new Date(minutes * 60000);
  const hour = String(dateTime.getUTCHours()).padStart(2, '0');
  const minute = String(dateTime.getUTCMinutes()).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${hour}:${minute}`;
};

const jsonObject = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new HttpError(400, 'A JSON object is required.');
  return value;
};

const publicStaff = (row: {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: number;
  created_at: string;
}) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  active: Boolean(row.active),
  createdAt: row.created_at
});

const allowedCategories = ['Sports', 'SUV', 'Electric', 'Luxury', 'Sedan'] as const;
const allowedTransmissions = ['Automatic', 'Manual'] as const;
const allowedFuelTypes = ['Petrol', 'Electric', 'Hybrid', 'Diesel'] as const;

function parseCar(input: Record<string, unknown>, id: string, current?: Car): Car {
  const merged: Record<string, unknown> = { ...(current ?? {}), ...input };
  const requireText = (key: string, fallback?: string): string => {
    const value = merged[key];
    if (isNonEmptyString(value)) return value.trim();
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, `${key} is required.`);
  };
  const numberValue = (key: string, fallback: number): number => {
    const value = merged[key] === undefined ? fallback : Number(merged[key]);
    if (!Number.isFinite(value) || value < 0) throw new HttpError(400, `${key} must be a non-negative number.`);
    return value;
  };

  const category = requireText('category', 'Sedan');
  const transmission = requireText('transmission', 'Automatic');
  const fuelType = requireText('fuelType', 'Petrol');
  const imageUrl = requireText('imageUrl');
  const pricePerDay = numberValue('pricePerDay', 0);
  if (!Number.isSafeInteger(pricePerDay) || pricePerDay < 1) {
    throw new HttpError(400, 'pricePerDay must be a positive whole number.');
  }
  const pricePerHour = numberValue('pricePerHour', current?.pricePerHour ?? 0);
  if (!Number.isSafeInteger(pricePerHour) || pricePerHour < 1) {
    throw new HttpError(400, 'pricePerHour must be a positive whole number.');
  }
  if (!allowedCategories.includes(category as (typeof allowedCategories)[number])) {
    throw new HttpError(400, 'category is not supported.');
  }
  if (!allowedTransmissions.includes(transmission as (typeof allowedTransmissions)[number])) {
    throw new HttpError(400, 'transmission is not supported.');
  }
  if (!allowedFuelTypes.includes(fuelType as (typeof allowedFuelTypes)[number])) {
    throw new HttpError(400, 'fuelType is not supported.');
  }
  if (
    !imageUrl.startsWith('/uploads/cars/') &&
    !imageUrl.startsWith('/images/') &&
    !/^https?:\/\//i.test(imageUrl)
  ) {
    throw new HttpError(400, 'imageUrl must be an uploaded image path or an http(s) URL.');
  }
  if (!Array.isArray(merged.features) || !merged.features.every((feature) => typeof feature === 'string')) {
    if (merged.features !== undefined) throw new HttpError(400, 'features must be an array of strings.');
  }
  if (
    merged.galleryImages !== undefined &&
    (!Array.isArray(merged.galleryImages) ||
      !merged.galleryImages.every((image) => typeof image === 'string'))
  ) {
    throw new HttpError(400, 'galleryImages must be an array of strings.');
  }

  return {
    id,
    name: requireText('name'),
    brand: requireText('brand'),
    model: requireText('model'),
    year: numberValue('year', new Date().getFullYear()),
    category: category as Car['category'],
    pricePerDay,
    pricePerHour,
    rating: numberValue('rating', 5),
    reviewCount: numberValue('reviewCount', 0),
    powerHp: numberValue('powerHp', 0),
    acceleration0to100: numberValue('acceleration0to100', 0),
    topSpeedKmH: numberValue('topSpeedKmH', 0),
    transmission: transmission as Car['transmission'],
    fuelType: fuelType as Car['fuelType'],
    seats: numberValue('seats', 5),
    doors: numberValue('doors', 4),
    color: requireText('color', 'Not specified'),
    imageUrl,
    galleryImages: (merged.galleryImages as string[] | undefined) ?? [imageUrl],
    description: requireText('description', ''),
    features: (merged.features as string[] | undefined) ?? [],
    location: requireText('location', 'Location to be confirmed'),
    isAvailable: merged.isAvailable === undefined ? true : merged.isAvailable === true,
    isPopular: merged.isPopular === true,
    isFeatured: merged.isFeatured === true,
    hostName: requireText('hostName', 'Aurevon Services Fleet'),
    hostRating: numberValue('hostRating', 5),
    mileageLimit: requireText('mileageLimit', '250 miles / day')
  };
}

function validImage(buffer: Buffer, contentType: string): boolean {
  if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

export function createApp(options: ServerOptions = {}) {
  const databasePath = resolve(options.databasePath ?? process.env.DATABASE_PATH ?? './data/rental.sqlite');
  const uploadDir = resolve(options.uploadDir ?? process.env.UPLOAD_DIR ?? './data/car-images');
  const gpsWebhookSecret = options.gpsWebhookSecret ?? process.env.GPS_WEBHOOK_SECRET;
  const bootstrapAdmin = options.bootstrapAdmin ?? (
    process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD
      ? {
          email: process.env.BOOTSTRAP_ADMIN_EMAIL,
          password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
          name: process.env.BOOTSTRAP_ADMIN_NAME
        }
      : undefined
  );

  mkdirSync(dirname(databasePath), { recursive: true });
  mkdirSync(uploadDir, { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cars (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      price_per_day INTEGER NOT NULL,
      price_per_hour INTEGER NOT NULL DEFAULT 0,
      is_available INTEGER NOT NULL DEFAULT 1,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      car_id TEXT NOT NULL REFERENCES cars(id),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      pickup_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      pickup_at TEXT NOT NULL DEFAULT '',
      return_at TEXT NOT NULL DEFAULT '',
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled')),
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS car_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      provider TEXT,
      received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_created ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS locations_car_recorded ON car_locations(car_id, recorded_at);
  `);

  const carColumns = database.prepare('PRAGMA table_info(cars)').all() as Array<{ name: string }>;
  if (!carColumns.some((column) => column.name === 'price_per_hour')) {
    database.exec('ALTER TABLE cars ADD COLUMN price_per_hour INTEGER NOT NULL DEFAULT 0');
  }
  const bookingColumns = database.prepare('PRAGMA table_info(bookings)').all() as Array<{ name: string }>;
  if (!bookingColumns.some((column) => column.name === 'pickup_at')) {
    database.exec("ALTER TABLE bookings ADD COLUMN pickup_at TEXT NOT NULL DEFAULT ''");
  }
  if (!bookingColumns.some((column) => column.name === 'return_at')) {
    database.exec("ALTER TABLE bookings ADD COLUMN return_at TEXT NOT NULL DEFAULT ''");
  }

  const legacyBookings = database.prepare(`
    SELECT id, pickup_date, return_date, payload_json
    FROM bookings WHERE pickup_at = '' OR return_at = ''
  `).all() as Array<{ id: string; pickup_date: string; return_date: string; payload_json: string }>;
  const updateLegacyBooking = database.prepare('UPDATE bookings SET pickup_at = ?, return_at = ? WHERE id = ?');
  for (const row of legacyBookings) {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    const pickupAt = typeof payload.pickupTime === 'string'
      ? toSortableDateTime(row.pickup_date, payload.pickupTime)
      : null;
    const returnAt = typeof payload.returnTime === 'string'
      ? toSortableDateTime(row.return_date, payload.returnTime)
      : null;
    updateLegacyBooking.run(
      pickupAt ?? `${row.pickup_date}T00:00`,
      returnAt ?? `${row.return_date}T23:59`,
      row.id
    );
  }
  database.exec('CREATE INDEX IF NOT EXISTS bookings_car_times ON bookings(car_id, pickup_at, return_at)');

  const now = new Date().toISOString();
  const addSeedCar = database.prepare(`
    INSERT OR IGNORE INTO cars
      (id, name, brand, price_per_day, price_per_hour, is_available, details_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const car of CARS_DATA) {
    addSeedCar.run(
      car.id,
      car.name,
      car.brand,
      car.pricePerDay,
      car.pricePerHour,
      Number(car.isAvailable),
      JSON.stringify(car),
      now,
      now
    );
  }

  const pricingVersion = (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (pricingVersion < 1) {
    const readCar = database.prepare('SELECT details_json FROM cars WHERE id = ?');
    const updateCarPricing = database.prepare(`
      UPDATE cars
      SET price_per_day = ?, price_per_hour = ?, details_json = ?, updated_at = ?
      WHERE id = ?
    `);
    for (const seedCar of CARS_DATA) {
      const row = readCar.get(seedCar.id) as { details_json: string } | undefined;
      if (!row) continue;
      const currentCar = JSON.parse(row.details_json) as Car;
      const updatedCar = {
        ...currentCar,
        pricePerDay: seedCar.pricePerDay,
        pricePerHour: seedCar.pricePerHour
      };
      updateCarPricing.run(
        updatedCar.pricePerDay,
        updatedCar.pricePerHour,
        JSON.stringify(updatedCar),
        now,
        seedCar.id
      );
    }
    const updateSeedBooking = database.prepare(`
      UPDATE bookings SET total_amount = ?, payload_json = ? WHERE id = ?
    `);
    for (const booking of INITIAL_BOOKINGS) {
      updateSeedBooking.run(booking.totalAmount, JSON.stringify(booking), booking.id);
    }
    database.exec('PRAGMA user_version = 1');
  }
  if (pricingVersion < 2) {
    // Bundled car photos moved from /src/assets/images/ to /images/ (served from public/).
    database.exec(`
      UPDATE cars SET details_json = REPLACE(details_json, '/src/assets/images/', '/images/');
      UPDATE bookings SET payload_json = REPLACE(payload_json, '/src/assets/images/', '/images/');
      PRAGMA user_version = 2;
    `);
  }

  const addSeedBooking = database.prepare(`
    INSERT OR IGNORE INTO bookings
      (id, car_id, customer_name, customer_email, pickup_date, return_date, pickup_at, return_at, total_amount, status, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const booking of INITIAL_BOOKINGS) {
    const status: BookingStatus =
      booking.status === 'upcoming' ? 'confirmed' :
      booking.status === 'active' ? 'active' :
      booking.status === 'completed' ? 'completed' : 'cancelled';
    addSeedBooking.run(
      booking.id,
      booking.carId,
      booking.driverInfo.fullName,
      booking.driverInfo.email,
      booking.pickupDate,
      booking.returnDate,
      toSortableDateTime(booking.pickupDate, booking.pickupTime) ?? `${booking.pickupDate}T00:00`,
      toSortableDateTime(booking.returnDate, booking.returnTime) ?? `${booking.returnDate}T23:59`,
      booking.totalAmount,
      status,
      JSON.stringify(booking),
      booking.createdAt,
      now
    );
  }

  const staffCount = (database.prepare('SELECT COUNT(*) AS count FROM staff').get() as { count: number }).count;
  if (staffCount === 0) {
    if (!bootstrapAdmin) {
      database.close();
      throw new Error('No staff accounts exist. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before starting the API.');
    }
    if (!isEmail(bootstrapAdmin.email.trim())) {
      database.close();
      throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
    }
    if (bootstrapAdmin.password.length < 12) {
      database.close();
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
    }
    database.prepare(`
      INSERT INTO staff (id, name, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, 'admin', ?)
    `).run(
      randomUUID(),
      bootstrapAdmin.name?.trim() || 'System Administrator',
      bootstrapAdmin.email.trim().toLowerCase(),
      hashPassword(bootstrapAdmin.password),
      now
    );
  }

  const app = express();
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads/cars', express.static(uploadDir, { fallthrough: false, maxAge: '1d' }));

  const recordActivity = (staffId: string | null, action: string, resourceType: string, resourceId: string | null, details: unknown) => {
    database.prepare(`
      INSERT INTO activity_logs (staff_id, action, resource_type, resource_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(staffId, action, resourceType, resourceId, JSON.stringify(details ?? {}), new Date().toISOString());
  };

  const requireAuth: RequestHandler = (request, response, next) => {
    const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const session = database.prepare(`
      SELECT s.id, s.name, s.email, s.role
      FROM sessions AS t
      JOIN staff AS s ON s.id = t.staff_id
      WHERE t.token_hash = ? AND t.expires_at > ? AND s.active = 1
    `).get(hashToken(token), new Date().toISOString()) as AuthUser | undefined;
    if (!session) {
      response.status(401).json({ error: 'Session is invalid or expired.' });
      return;
    }
    (request as AuthRequest).authUser = session;
    next();
  };

  const requireRoles = (...roles: Role[]): RequestHandler => (request, response, next) => {
    const user = (request as AuthRequest).authUser;
    if (!user || !roles.includes(user.role)) {
      response.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };

  const sendError = (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (isRecord(error) && error.type === 'entity.too.large') {
      response.status(413).json({ error: 'Request body is too large.' });
      return;
    }
    if (isRecord(error) && error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Request body must contain valid JSON.' });
      return;
    }
    if (isRecord(error) && typeof error.status === 'number' && error.status === 404) {
      response.status(404).json({ error: 'Resource not found.' });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'An unexpected server error occurred.' });
  };

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

  app.get('/api/cars', (_request, response) => {
    const rows = database.prepare(`
      SELECT details_json, is_available FROM cars WHERE is_available = 1 ORDER BY name
    `).all() as Array<{ details_json: string; is_available: number }>;
    response.json(rows.map((row) => ({ ...JSON.parse(row.details_json), isAvailable: Boolean(row.is_available) })));
  });

  app.post('/api/auth/login', (request, response) => {
    const ip = request.ip || 'unknown';
    const now = Date.now();
    const attempts = loginAttempts.get(ip);
    if (attempts && attempts.resetAt <= now) loginAttempts.delete(ip);
    const currentAttempts = loginAttempts.get(ip);
    if (currentAttempts && currentAttempts.count >= 10) {
      response.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
      return;
    }
    const body = jsonObject(request.body);
    if (!isNonEmptyString(body.email) || typeof body.password !== 'string') {
      throw new HttpError(400, 'Email and password are required.');
    }
    const staff = database.prepare(`
      SELECT id, name, email, password_hash, role, active FROM staff WHERE email = ?
    `).get(body.email.trim().toLowerCase()) as
      | { id: string; name: string; email: string; password_hash: string; role: Role; active: number }
      | undefined;
    if (!staff || !staff.active || !verifyPassword(body.password, staff.password_hash)) {
      const current = loginAttempts.get(ip);
      loginAttempts.set(ip, {
        count: (current?.count ?? 0) + 1,
        resetAt: current?.resetAt ?? now + 15 * 60 * 1000
      });
      response.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    loginAttempts.delete(ip);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    database.prepare('INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), staff.id, expiresAt);
    response.json({
      token,
      expiresAt,
      user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }
    });
  });

  app.post('/api/auth/logout', requireAuth, (request, response) => {
    const token = request.get('authorization')!.replace(/^Bearer\s+/i, '');
    database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    response.status(204).end();
  });

  app.get('/api/auth/me', requireAuth, (request, response) => {
    response.json((request as AuthRequest).authUser);
  });

  app.post('/api/bookings', (request, response) => {
    const body = jsonObject(request.body);
    const requiredText = (key: string): string => {
      if (!isNonEmptyString(body[key])) throw new HttpError(400, `${key} is required.`);
      return (body[key] as string).trim();
    };
    const carId = requiredText('carId');
    const pickupDate = body.pickupDate;
    const returnDate = body.returnDate;
    if (!isDate(pickupDate) || !isDate(returnDate)) {
      throw new HttpError(400, 'Valid pickupDate and returnDate values are required.');
    }
    const durationUnit = body.durationUnit === undefined ? 'day' : body.durationUnit;
    if (durationUnit !== 'day' && durationUnit !== 'hour') {
      throw new HttpError(400, 'durationUnit must be day or hour.');
    }
    if (durationUnit === 'day' && returnDate <= pickupDate) {
      throw new HttpError(400, 'A full-day booking requires a later returnDate.');
    }
    const carRow = database.prepare('SELECT * FROM cars WHERE id = ?').get(carId) as
      | (DatabaseCarRow & { name: string; brand: string; price_per_day: number; price_per_hour: number })
      | undefined;
    if (!carRow || !carRow.is_available) throw new HttpError(409, 'This vehicle is not currently available.');

    const driverInfo = jsonObject(body.driverInfo);
    for (const key of ['fullName', 'email', 'phone', 'licenseNumber']) {
      if (!isNonEmptyString(driverInfo[key])) throw new HttpError(400, `driverInfo.${key} is required.`);
    }
    if (driverInfo.ageConfirmed !== true) throw new HttpError(400, 'Driver age must be confirmed.');
    const paymentMethod = requiredText('paymentMethod');
    const pickupLocation = requiredText('pickupLocation');
    const returnLocation = requiredText('returnLocation');
    const pickupTime = requiredText('pickupTime');
    const returnTime = requiredText('returnTime');
    const pickupAt = toSortableDateTime(pickupDate, pickupTime);
    const returnAt = toSortableDateTime(returnDate, returnTime);
    const pickupMinutes = getDateTimeMinutes(pickupDate, pickupTime);
    const returnMinutes = getDateTimeMinutes(returnDate, returnTime);
    if (pickupAt === null || returnAt === null || pickupMinutes === null || returnMinutes === null) {
      throw new HttpError(400, 'pickupTime and returnTime must use a valid 12-hour time.');
    }
    if (returnMinutes <= pickupMinutes) {
      throw new HttpError(400, 'Return date and time must be after the pick-up date and time.');
    }
    const overlap = database.prepare(`
      SELECT 1 FROM bookings
      WHERE car_id = ? AND status IN ('pending', 'confirmed', 'active')
        AND pickup_at < ? AND return_at > ?
      LIMIT 1
    `).get(carId, returnAt, pickupAt);
    if (overlap) throw new HttpError(409, 'This vehicle already has a booking during that time.');

    const durationMinutes = returnMinutes - pickupMinutes;
    const totalHours = Math.max(1, Math.ceil(durationMinutes / 60));
    const totalDays = durationUnit === 'day'
      ? Math.ceil(
          (Date.parse(`${returnDate}T00:00:00.000Z`) - Date.parse(`${pickupDate}T00:00:00.000Z`)) / 86400000
        )
      : Math.max(1, Math.ceil(totalHours / 24));
    const durationValue = durationUnit === 'hour' ? totalHours : totalDays;
    const car = JSON.parse(carRow.details_json) as Car;
    const suppliedServices = Array.isArray(body.extraServices) ? body.extraServices : [];
    const serviceIds = suppliedServices.map((service) => isRecord(service) ? service.id : service);
    if (serviceIds.some((id) => !INITIAL_EXTRA_SERVICES.some((service) => service.id === id))) {
      throw new HttpError(400, 'One or more extra services are not supported.');
    }
    const extraServices = INITIAL_EXTRA_SERVICES
      .filter((service) => serviceIds.includes(service.id))
      .map((service) => ({ ...service, selected: true }));
    const basePrice = durationUnit === 'hour'
      ? car.pricePerHour * totalHours
      : car.pricePerDay * totalDays;
    const extrasTotal = extraServices.reduce(
      (total, service) => total + (durationUnit === 'hour'
        ? Math.round(service.pricePerDay * totalHours / 24)
        : service.pricePerDay * totalDays),
      0
    );
    const taxAmount = Math.round((basePrice + extrasTotal) * 0.08);
    const subtotal = basePrice + extrasTotal + taxAmount;
    if (![basePrice, extrasTotal, taxAmount, subtotal].every(Number.isSafeInteger)) {
      throw new HttpError(400, 'The requested booking total is outside the supported range.');
    }
    const promoCode = typeof body.promoCode === 'string' ? body.promoCode.trim().toUpperCase() : '';
    if (promoCode && promoCode !== 'DRIVE20' && promoCode !== 'VIP10') {
      throw new HttpError(400, 'The promo code is invalid.');
    }
    const discount = promoCode === 'DRIVE20' ? Math.round(subtotal * 0.2) : promoCode === 'VIP10' ? 50000 : 0;
    const createdAt = new Date().toISOString();
    const booking: Booking = {
      id: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
      carId,
      car,
      pickupDate,
      returnDate,
      pickupTime,
      returnTime,
      pickupLocation,
      returnLocation,
      durationUnit,
      durationValue,
      totalDays,
      basePrice,
      extraServices,
      discount,
      taxAmount,
      totalAmount: Math.max(0, subtotal - discount),
      status: 'upcoming',
      driverInfo: {
        fullName: driverInfo.fullName as string,
        email: driverInfo.email as string,
        phone: driverInfo.phone as string,
        licenseNumber: driverInfo.licenseNumber as string,
        ageConfirmed: driverInfo.ageConfirmed === true
      },
      paymentMethod,
      createdAt,
      digitalPassCode: `PASS-${randomUUID().slice(0, 6).toUpperCase()}`
    };
    database.prepare(`
      INSERT INTO bookings
        (id, car_id, customer_name, customer_email, pickup_date, return_date, pickup_at, return_at, total_amount, status, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      booking.id,
      carId,
      booking.driverInfo.fullName,
      booking.driverInfo.email,
      pickupDate,
      returnDate,
      pickupAt,
      returnAt,
      booking.totalAmount,
      JSON.stringify(booking),
      createdAt,
      createdAt
    );
    recordActivity(null, 'booking.created', 'booking', booking.id, { carId, status: 'pending' });
    response.status(201).json({ ...booking, managementStatus: 'pending' });
  });

  app.get('/api/bookings/:id/status', (request, response) => {
    const email = request.get('x-booking-email')?.trim().toLowerCase();
    if (!email || !isEmail(email)) throw new HttpError(400, 'A valid X-Booking-Email header is required.');
    const row = database.prepare(`
      SELECT b.id, b.status, b.pickup_date, b.return_date, b.total_amount, b.updated_at, c.name AS car_name
      FROM bookings AS b JOIN cars AS c ON c.id = b.car_id
      WHERE b.id = ? AND lower(b.customer_email) = ?
    `).get(request.params.id, email) as
      | {
          id: string;
          status: BookingStatus;
          pickup_date: string;
          return_date: string;
          total_amount: number;
          updated_at: string;
          car_name: string;
        }
      | undefined;
    if (!row) throw new HttpError(404, 'Booking not found.');
    response.json({
      id: row.id,
      status: bookingClientStatus(row.status),
      managementStatus: row.status,
      pickupDate: row.pickup_date,
      returnDate: row.return_date,
      totalAmount: row.total_amount,
      carName: row.car_name,
      updatedAt: row.updated_at
    });
  });

  app.use('/api/management', requireAuth);

  app.get('/api/management/dashboard', (request, response) => {
    const bookingCounts = database.prepare(`
      SELECT status, COUNT(*) AS count FROM bookings GROUP BY status
    `).all() as Array<{ status: BookingStatus; count: number }>;
    const carCounts = database.prepare(`
      SELECT COUNT(*) AS total, SUM(is_available) AS available FROM cars
    `).get() as { total: number; available: number | null };
    const user = (request as AuthRequest).authUser!;
    response.json({
      bookings: Object.fromEntries(bookingCounts.map(({ status, count }) => [status, count])),
      cars: { total: carCounts.total, available: carCounts.available ?? 0 },
      staff: user.role === 'admin' || user.role === 'manager'
        ? (database.prepare('SELECT COUNT(*) AS count FROM staff WHERE active = 1').get() as { count: number }).count
        : undefined
    });
  });

  app.get('/api/management/staff', requireRoles('admin', 'manager'), (_request, response) => {
    const rows = database.prepare(`
      SELECT id, name, email, role, active, created_at FROM staff ORDER BY created_at DESC
    `).all() as Array<{ id: string; name: string; email: string; role: Role; active: number; created_at: string }>;
    response.json(rows.map(publicStaff));
  });

  app.post('/api/management/staff', requireRoles('admin', 'manager'), (request, response) => {
    const body = jsonObject(request.body);
    if (
      !isNonEmptyString(body.name) ||
      !isNonEmptyString(body.email) ||
      !isEmail(body.email.trim()) ||
      typeof body.password !== 'string'
    ) {
      throw new HttpError(400, 'name, email, and password are required.');
    }
    if (body.password.length < 12) throw new HttpError(400, 'password must be at least 12 characters.');
    const requester = (request as AuthRequest).authUser!;
    const role = body.role ?? 'staff';
    if (role !== 'staff' && role !== 'manager') throw new HttpError(400, 'New accounts can only be staff or manager accounts.');
    if (requester.role !== 'admin' && role !== 'staff') {
      throw new HttpError(403, 'Only an admin can create manager accounts.');
    }
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      database.prepare(`
        INSERT INTO staff (id, name, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, body.name.trim(), body.email.trim().toLowerCase(), hashPassword(body.password), role, createdAt);
    } catch (error) {
      if (isRecord(error) && String(error.message).includes('UNIQUE')) {
        throw new HttpError(409, 'A staff account with that email already exists.');
      }
      throw error;
    }
    recordActivity(requester.id, 'staff.created', 'staff', id, { role });
    response.status(201).json({
      id,
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      role,
      active: true,
      createdAt
    });
  });

  app.patch('/api/management/staff/:id', requireRoles('admin', 'manager'), (request, response) => {
    const body = jsonObject(request.body);
    const requester = (request as AuthRequest).authUser!;
    const target = database.prepare(`
      SELECT id, name, email, role, active, created_at FROM staff WHERE id = ?
    `).get(request.params.id) as
      | { id: string; name: string; email: string; role: Role; active: number; created_at: string }
      | undefined;
    if (!target) throw new HttpError(404, 'Staff account not found.');
    if (requester.role === 'manager' && target.role !== 'staff') {
      throw new HttpError(403, 'Managers can only update staff accounts.');
    }
    if (target.id === requester.id && (body.active === false || body.role !== undefined)) {
      throw new HttpError(400, 'You cannot deactivate or change your own role.');
    }
    const roleCandidate = body.role === undefined ? target.role : body.role;
    const active = body.active === undefined ? target.active : body.active === true ? 1 : body.active === false ? 0 : -1;
    if (
      (roleCandidate !== 'admin' && roleCandidate !== 'manager' && roleCandidate !== 'staff') ||
      active < 0
    ) {
      throw new HttpError(400, 'role or active value is invalid.');
    }
    const role: Role = roleCandidate;
    if (requester.role === 'manager' && role !== 'staff') {
      throw new HttpError(403, 'Managers cannot change staff roles.');
    }
    if (target.role === 'admin' && (role !== 'admin' || active === 0)) {
      const activeAdmins = (database.prepare(`
        SELECT COUNT(*) AS count FROM staff WHERE role = 'admin' AND active = 1
      `).get() as { count: number }).count;
      if (activeAdmins <= 1) throw new HttpError(400, 'The last active admin cannot be removed or deactivated.');
    }
    const name = body.name === undefined ? target.name : body.name;
    if (!isNonEmptyString(name)) throw new HttpError(400, 'name must be a non-empty string.');
    database.prepare('UPDATE staff SET name = ?, role = ?, active = ? WHERE id = ?')
      .run(name.trim(), role, active, target.id);
    if (active === 0 || role !== target.role) {
      database.prepare('DELETE FROM sessions WHERE staff_id = ?').run(target.id);
    }
    const updated = database.prepare(`
      SELECT id, name, email, role, active, created_at FROM staff WHERE id = ?
    `).get(target.id) as typeof target;
    recordActivity(requester.id, 'staff.updated', 'staff', target.id, { role, active: Boolean(active) });
    response.json(publicStaff(updated));
  });

  app.get('/api/management/cars', (_request, response) => {
    const rows = database.prepare('SELECT details_json, is_available FROM cars ORDER BY name')
      .all() as Array<{ details_json: string; is_available: number }>;
    response.json(rows.map((row) => ({ ...JSON.parse(row.details_json), isAvailable: Boolean(row.is_available) })));
  });

  app.post(
    '/api/management/cars/images',
    requireRoles('admin', 'manager'),
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
    (request, response) => {
      const contentType = request.get('content-type')?.split(';')[0] ?? '';
      if (!Buffer.isBuffer(request.body) || !validImage(request.body, contentType)) {
        throw new HttpError(400, 'Upload a valid JPEG, PNG, or WebP image.');
      }
      const extension = contentType === 'image/jpeg' ? '.jpg' : contentType === 'image/png' ? '.png' : '.webp';
      const fileName = `${randomUUID()}${extension}`;
      writeFileSync(resolve(uploadDir, fileName), request.body, { flag: 'wx' });
      const user = (request as AuthRequest).authUser!;
      recordActivity(user.id, 'car.image_uploaded', 'car-image', fileName, { contentType });
      response.status(201).json({ imageUrl: `/uploads/cars/${fileName}` });
    }
  );

  app.post('/api/management/cars', requireRoles('admin', 'manager'), (request, response) => {
    const body = jsonObject(request.body);
    const id = `car-${randomUUID()}`;
    const car = parseCar(body, id);
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO cars
        (id, name, brand, price_per_day, price_per_hour, is_available, details_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      car.name,
      car.brand,
      car.pricePerDay,
      car.pricePerHour,
      Number(car.isAvailable),
      JSON.stringify(car),
      now,
      now
    );
    recordActivity((request as AuthRequest).authUser!.id, 'car.created', 'car', id, { name: car.name });
    response.status(201).json(car);
  });

  app.patch('/api/management/cars/:id', requireRoles('admin', 'manager'), (request, response) => {
    const body = jsonObject(request.body);
    const row = database.prepare('SELECT * FROM cars WHERE id = ?').get(request.params.id) as
      | (DatabaseCarRow & { name: string; brand: string; price_per_day: number })
      | undefined;
    if (!row) throw new HttpError(404, 'Vehicle not found.');
    const current = { ...JSON.parse(row.details_json), isAvailable: Boolean(row.is_available) } as Car;
    const car = parseCar(body, row.id, current);
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE cars
      SET name = ?, brand = ?, price_per_day = ?, price_per_hour = ?, is_available = ?, details_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      car.name,
      car.brand,
      car.pricePerDay,
      car.pricePerHour,
      Number(car.isAvailable),
      JSON.stringify(car),
      now,
      row.id
    );
    recordActivity((request as AuthRequest).authUser!.id, 'car.updated', 'car', row.id, { name: car.name });
    response.json(car);
  });

  app.patch('/api/management/cars/:id/availability', requireRoles('admin', 'manager', 'staff'), (request, response) => {
    const body = jsonObject(request.body);
    if (typeof body.isAvailable !== 'boolean') throw new HttpError(400, 'isAvailable must be a boolean.');
    const row = database.prepare('SELECT * FROM cars WHERE id = ?').get(request.params.id) as
      | (DatabaseCarRow & { name: string; brand: string; price_per_day: number })
      | undefined;
    if (!row) throw new HttpError(404, 'Vehicle not found.');
    const car = { ...JSON.parse(row.details_json), isAvailable: body.isAvailable } as Car;
    database.prepare(`
      UPDATE cars SET is_available = ?, details_json = ?, updated_at = ? WHERE id = ?
    `).run(Number(body.isAvailable), JSON.stringify(car), new Date().toISOString(), row.id);
    recordActivity((request as AuthRequest).authUser!.id, 'car.availability_changed', 'car', row.id, {
      isAvailable: body.isAvailable
    });
    response.json(car);
  });

  app.get('/api/management/bookings', requireRoles('admin', 'manager', 'staff'), (request, response) => {
    const status = request.query.status;
    const statusFilter = typeof status === 'string' ? status : undefined;
    if (status !== undefined && (!statusFilter || !isBookingStatus(statusFilter))) {
      throw new HttpError(400, 'status filter is invalid.');
    }
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
    const offset = Math.max(0, Number(request.query.offset) || 0);
    const rows = statusFilter
      ? database.prepare('SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
          .all(statusFilter, limit, offset)
      : database.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT ? OFFSET ?')
          .all(limit, offset);
    response.json((rows as unknown as DatabaseBookingRow[]).map((row) => ({
      ...JSON.parse(row.payload_json),
      status: bookingClientStatus(row.status),
      managementStatus: row.status,
      updatedAt: row.updated_at
    })));
  });

  app.patch('/api/management/bookings/:id/status', requireRoles('admin', 'manager', 'staff'), (request, response) => {
    const body = jsonObject(request.body);
    const nextStatus = body.status;
    const transitions: Record<BookingStatus, BookingStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: []
    };
    if (!isBookingStatus(nextStatus)) {
      throw new HttpError(400, 'Booking status is invalid.');
    }
    const statusToSet = nextStatus;
    const row = database.prepare('SELECT * FROM bookings WHERE id = ?').get(request.params.id) as
      | (DatabaseBookingRow & {
          car_id: string;
          pickup_date: string;
          return_date: string;
          pickup_at: string;
          return_at: string;
        })
      | undefined;
    if (!row) throw new HttpError(404, 'Booking not found.');
    if (!transitions[row.status].includes(statusToSet)) {
      throw new HttpError(409, `Cannot change booking status from ${row.status} to ${statusToSet}.`);
    }
    if (statusToSet === 'confirmed') {
      const car = database.prepare('SELECT is_available FROM cars WHERE id = ?').get(row.car_id) as
        | { is_available: number }
        | undefined;
      const overlap = database.prepare(`
        SELECT 1 FROM bookings
        WHERE id != ? AND car_id = ? AND status IN ('pending', 'confirmed', 'active')
          AND pickup_at < ? AND return_at > ?
        LIMIT 1
      `).get(row.id, row.car_id, row.return_at, row.pickup_at);
      if (!car?.is_available || overlap) {
        throw new HttpError(409, 'Vehicle availability cannot be confirmed for this time.');
      }
    }
    const updatedAt = new Date().toISOString();
    database.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?')
      .run(statusToSet, updatedAt, row.id);
    recordActivity((request as AuthRequest).authUser!.id, 'booking.status_changed', 'booking', row.id, {
      from: row.status,
      to: statusToSet
    });
    response.json({
      ...JSON.parse(row.payload_json),
      status: bookingClientStatus(statusToSet),
      managementStatus: statusToSet,
      updatedAt
    });
  });

  app.get('/api/management/locations', requireRoles('admin', 'manager', 'staff'), (_request, response) => {
    const locations = database.prepare(`
      SELECT l.car_id AS carId, c.name AS carName, l.latitude, l.longitude,
        l.recorded_at AS recordedAt, l.provider
      FROM car_locations AS l
      JOIN cars AS c ON c.id = l.car_id
      WHERE l.id = (
        SELECT latest.id FROM car_locations AS latest
        WHERE latest.car_id = l.car_id ORDER BY latest.recorded_at DESC, latest.id DESC LIMIT 1
      )
      ORDER BY l.recorded_at DESC
    `).all();
    response.json(locations);
  });

  app.get('/api/management/activity', requireRoles('admin', 'manager'), (request, response) => {
    const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
    response.json(database.prepare(`
      SELECT a.id, a.action, a.resource_type AS resourceType, a.resource_id AS resourceId,
        a.details_json AS details, a.created_at AS createdAt, s.name AS staffName, s.email AS staffEmail
      FROM activity_logs AS a LEFT JOIN staff AS s ON s.id = a.staff_id
      ORDER BY a.created_at DESC LIMIT ?
    `).all(limit).map((row) => {
      const activity = row as Record<string, unknown>;
      return { ...activity, details: JSON.parse(activity.details as string) };
    }));
  });

  app.post('/api/integrations/gps/locations', (request, response) => {
    if (!gpsWebhookSecret) throw new HttpError(503, 'GPS provider integration is not configured.');
    const suppliedSecret = request.get('x-gps-webhook-secret') ?? '';
    const expected = Buffer.from(gpsWebhookSecret);
    const supplied = Buffer.from(suppliedSecret);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new HttpError(401, 'GPS webhook authentication failed.');
    }
    const body = jsonObject(request.body);
    if (!isNonEmptyString(body.carId) || typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      throw new HttpError(400, 'carId, latitude, and longitude are required.');
    }
    if (body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180) {
      throw new HttpError(400, 'GPS coordinates are outside valid ranges.');
    }
    const car = database.prepare('SELECT id FROM cars WHERE id = ?').get(body.carId);
    if (!car) throw new HttpError(404, 'Vehicle not found.');
    if (body.recordedAt !== undefined && (typeof body.recordedAt !== 'string' || Number.isNaN(Date.parse(body.recordedAt)))) {
      throw new HttpError(400, 'recordedAt must be a valid date-time.');
    }
    const recordedAt = typeof body.recordedAt === 'string'
      ? new Date(body.recordedAt).toISOString()
      : new Date().toISOString();
    database.prepare(`
      INSERT INTO car_locations (car_id, latitude, longitude, recorded_at, provider, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(body.carId, body.latitude, body.longitude, recordedAt, typeof body.provider === 'string' ? body.provider : null, new Date().toISOString());
    response.status(201).json({ received: true, carId: body.carId, recordedAt });
  });

  app.use((request, response) => {
    response.status(404).json({ error: `No API route for ${request.method} ${request.path}.` });
  });
  app.use(sendError);

  return { app, close: () => database.close() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app } = createApp();
  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`Car rental API listening on port ${port}.`);
  });
}
