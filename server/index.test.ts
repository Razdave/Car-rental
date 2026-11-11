import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo, Server } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from './index.ts';
import { CARS_DATA } from '../src/data/cars.ts';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'car-rental-api-'));
const gpsSecret = 'test-gps-secret-value';
let server: Server;
let closeDatabase: () => void;
let baseUrl: string;

before(async () => {
  const instance = createApp({
    databasePath: join(temporaryDirectory, 'test.sqlite'),
    uploadDir: join(temporaryDirectory, 'images'),
    gpsWebhookSecret: gpsSecret,
    bootstrapAdmin: {
      name: 'Test Admin',
      email: 'admin@example.test',
      password: 'a-secure-test-password'
    }
  });
  closeDatabase = instance.close;
  server = instance.app.listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  closeDatabase?.();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('authenticates staff, manages bookings and cars, and stores GPS updates', async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  const publicCarsResponse = await fetch(`${baseUrl}/api/cars`);
  const seededPublicCars = await publicCarsResponse.json() as Array<{
    id: string;
    pricePerDay: number;
    pricePerHour: number;
  }>;
  assert.equal(seededPublicCars.length, 6);
  assert.ok(seededPublicCars.every((car) => car.pricePerDay === 800000));
  assert.equal(seededPublicCars.find((car) => car.id === 'car-audi-r8')?.pricePerHour, 150000);
  assert.equal(seededPublicCars.find((car) => car.id === 'car-range-rover')?.pricePerHour, 180000);
  assert.equal(seededPublicCars.find((car) => car.id === 'car-lucid-air')?.pricePerHour, 180000);
  assert.equal(seededPublicCars.find((car) => car.id === 'car-bmw-m4')?.pricePerHour, 200000);
  assert.equal(seededPublicCars.find((car) => car.id === 'car-taycan-cross')?.pricePerHour, 200000);
  assert.equal(seededPublicCars.find((car) => car.id === 'car-g63-amg')?.pricePerHour, 200000);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'a-secure-test-password' })
  });
  assert.equal(loginResponse.status, 200);
  const adminSession = await loginResponse.json() as { token: string };
  const adminHeaders = {
    Authorization: `Bearer ${adminSession.token}`,
    'Content-Type': 'application/json'
  };

  const seededBookings = await fetch(`${baseUrl}/api/management/bookings`, { headers: adminHeaders });
  assert.equal(seededBookings.status, 200);
  assert.equal((await seededBookings.json() as unknown[]).length, 3);

  const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: 'car-audi-r8',
      pickupDate: '2031-02-01',
      returnDate: '2031-02-03',
      pickupTime: '10:00 AM',
      returnTime: '10:00 AM',
      pickupLocation: 'Beverly Hills',
      returnLocation: 'Beverly Hills',
      extraServices: [{ id: 'insurance-full', selected: true }],
      driverInfo: {
        fullName: 'Test Customer',
        email: 'customer@example.test',
        phone: '+10000000000',
        licenseNumber: 'TEST-123',
        ageConfirmed: true
      },
      paymentMethod: 'Visa ending in 4242',
      promoCode: 'VIP10',
      totalAmount: 1
    })
  });
  assert.equal(bookingResponse.status, 201);
  const booking = await bookingResponse.json() as {
    id: string;
    totalAmount: number;
    managementStatus: string;
  };
  assert.equal(booking.totalAmount, 1732000);
  assert.equal(booking.managementStatus, 'pending');
  const privateStatusResponse = await fetch(`${baseUrl}/api/bookings/${booking.id}/status`, {
    headers: { 'X-Booking-Email': 'customer@example.test' }
  });
  assert.equal(privateStatusResponse.status, 200);
  assert.equal((await privateStatusResponse.json() as { managementStatus: string }).managementStatus, 'pending');
  const deniedStatusResponse = await fetch(`${baseUrl}/api/bookings/${booking.id}/status`, {
    headers: { 'X-Booking-Email': 'wrong@example.test' }
  });
  assert.equal(deniedStatusResponse.status, 404);

  const overlapResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: 'car-audi-r8',
      pickupDate: '2031-02-02',
      returnDate: '2031-02-04',
      pickupTime: '10:00 AM',
      returnTime: '10:00 AM',
      pickupLocation: 'Beverly Hills',
      returnLocation: 'Beverly Hills',
      extraServices: [],
      driverInfo: {
        fullName: 'Other Customer',
        email: 'other@example.test',
        phone: '+10000000000',
        licenseNumber: 'TEST-456',
        ageConfirmed: true
      },
      paymentMethod: 'Apple Pay'
    })
  });
  assert.equal(overlapResponse.status, 409);

  const hourlyBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: 'car-audi-r8',
      pickupDate: '2031-02-05',
      returnDate: '2031-02-05',
      pickupTime: '09:00 AM',
      returnTime: '11:30 AM',
      durationUnit: 'hour',
      pickupLocation: 'Beverly Hills',
      returnLocation: 'Beverly Hills',
      extraServices: [{ id: 'insurance-full' }],
      driverInfo: {
        fullName: 'Hourly Customer',
        email: 'hourly@example.test',
        phone: '+10000000000',
        licenseNumber: 'TEST-HOUR',
        ageConfirmed: true
      },
      paymentMethod: 'Visa ending in 4242'
    })
  });
  assert.equal(hourlyBookingResponse.status, 201);
  const hourlyBooking = await hourlyBookingResponse.json() as {
    durationUnit: string;
    durationValue: number;
    basePrice: number;
    totalAmount: number;
  };
  assert.equal(hourlyBooking.durationUnit, 'hour');
  assert.equal(hourlyBooking.durationValue, 3);
  assert.equal(hourlyBooking.basePrice, 450000);
  assert.equal(hourlyBooking.totalAmount, 489375);

  const hourlyOverlapResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: 'car-audi-r8',
      pickupDate: '2031-02-05',
      returnDate: '2031-02-05',
      pickupTime: '10:00 AM',
      returnTime: '11:00 AM',
      durationUnit: 'hour',
      pickupLocation: 'Beverly Hills',
      returnLocation: 'Beverly Hills',
      extraServices: [],
      driverInfo: {
        fullName: 'Overlapping Customer',
        email: 'overlapping@example.test',
        phone: '+10000000000',
        licenseNumber: 'TEST-OVERLAP',
        ageConfirmed: true
      },
      paymentMethod: 'Apple Pay'
    })
  });
  assert.equal(hourlyOverlapResponse.status, 409);

  const backToBackHourlyResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: 'car-audi-r8',
      pickupDate: '2031-02-05',
      returnDate: '2031-02-05',
      pickupTime: '11:30 AM',
      returnTime: '12:00 PM',
      durationUnit: 'hour',
      pickupLocation: 'Beverly Hills',
      returnLocation: 'Beverly Hills',
      extraServices: [],
      driverInfo: {
        fullName: 'Next Customer',
        email: 'next@example.test',
        phone: '+10000000000',
        licenseNumber: 'TEST-NEXT',
        ageConfirmed: true
      },
      paymentMethod: 'Apple Pay'
    })
  });
  assert.equal(backToBackHourlyResponse.status, 201);
  assert.equal((await backToBackHourlyResponse.json() as { durationValue: number }).durationValue, 1);

  const confirmedResponse = await fetch(`${baseUrl}/api/management/bookings/${booking.id}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(confirmedResponse.status, 200);
  assert.equal((await confirmedResponse.json() as { managementStatus: string }).managementStatus, 'confirmed');
  const refreshedStatusResponse = await fetch(`${baseUrl}/api/bookings/${booking.id}/status`, {
    headers: { 'X-Booking-Email': 'customer@example.test' }
  });
  assert.equal((await refreshedStatusResponse.json() as { managementStatus: string }).managementStatus, 'confirmed');

  const staffResponse = await fetch(`${baseUrl}/api/management/staff`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Test Staff',
      email: 'staff@example.test',
      password: 'another-secure-password',
      role: 'staff'
    })
  });
  assert.equal(staffResponse.status, 201);

  const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'staff@example.test', password: 'another-secure-password' })
  });
  const staffSession = await staffLogin.json() as { token: string };
  const staffHeaders = {
    Authorization: `Bearer ${staffSession.token}`,
    'Content-Type': 'application/json'
  };
  const forbiddenStaffList = await fetch(`${baseUrl}/api/management/staff`, { headers: staffHeaders });
  assert.equal(forbiddenStaffList.status, 403);

  const unavailableResponse = await fetch(`${baseUrl}/api/management/cars/car-bmw-m4/availability`, {
    method: 'PATCH',
    headers: staffHeaders,
    body: JSON.stringify({ isAvailable: false })
  });
  assert.equal(unavailableResponse.status, 200);
  const publicCars = await fetch(`${baseUrl}/api/cars`);
  const publicCarsBody = await publicCars.json() as Array<{ id: string }>;
  assert.equal(publicCarsBody.some((car) => car.id === 'car-bmw-m4'), false);

  const uploadResponse = await fetch(`${baseUrl}/api/management/cars/images`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'image/jpeg' },
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  });
  assert.equal(uploadResponse.status, 201);
  const upload = await uploadResponse.json() as { imageUrl: string };
  const newCarResponse = await fetch(`${baseUrl}/api/management/cars`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Test Coupe',
      brand: 'Aurevon',
      model: 'Coupe',
      year: 2026,
      category: 'Sports',
      pricePerDay: 195000,
      pricePerHour: 200000,
      imageUrl: upload.imageUrl
    })
  });
  assert.equal(newCarResponse.status, 201);

  const gpsResponse = await fetch(`${baseUrl}/api/integrations/gps/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPS-Webhook-Secret': gpsSecret
    },
    body: JSON.stringify({
      carId: 'car-bmw-m4',
      latitude: 6.5244,
      longitude: 3.3792,
      provider: 'test-provider',
      recordedAt: '2031-02-01T10:00:00.000Z'
    })
  });
  assert.equal(gpsResponse.status, 201);
  const locations = await fetch(`${baseUrl}/api/management/locations`, { headers: adminHeaders });
  assert.equal((await locations.json() as unknown[]).length, 1);
});

test('migrates existing fleet rates and booking times', async () => {
  const databasePath = join(temporaryDirectory, 'legacy.sqlite');
  const legacyDatabase = new DatabaseSync(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE cars (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      price_per_day INTEGER NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      car_id TEXT NOT NULL REFERENCES cars(id),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      pickup_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const legacyCar = { ...CARS_DATA[0], pricePerDay: 280000 };
  Reflect.deleteProperty(legacyCar, 'pricePerHour');
  const now = new Date().toISOString();
  legacyDatabase.prepare(`
    INSERT INTO cars (id, name, brand, price_per_day, is_available, details_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    legacyCar.id,
    legacyCar.name,
    legacyCar.brand,
    legacyCar.pricePerDay,
    1,
    JSON.stringify(legacyCar),
    now,
    now
  );
  legacyDatabase.prepare(`
    INSERT INTO bookings
      (id, car_id, customer_name, customer_email, pickup_date, return_date, total_amount, status, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'BK-LEGACY',
    legacyCar.id,
    'Legacy Customer',
    'legacy@example.test',
    '2032-03-01',
    '2032-03-01',
    100000,
    'pending',
    JSON.stringify({ pickupTime: '10:00 AM', returnTime: '06:00 PM' }),
    now,
    now
  );
  legacyDatabase.close();

  const instance = createApp({
    databasePath,
    uploadDir: join(temporaryDirectory, 'legacy-images'),
    bootstrapAdmin: {
      email: 'legacy-admin@example.test',
      password: 'a-secure-test-password'
    }
  });
  const migrationServer = instance.app.listen(0);
  await once(migrationServer, 'listening');
  const address = migrationServer.address() as AddressInfo;
  const migrationUrl = `http://127.0.0.1:${address.port}`;

  try {
    const carResponse = await fetch(`${migrationUrl}/api/cars`);
    const cars = await carResponse.json() as Array<{ id: string; pricePerDay: number; pricePerHour: number }>;
    const migratedAudi = cars.find((car) => car.id === 'car-audi-r8');
    assert.equal(migratedAudi?.pricePerDay, 800000);
    assert.equal(migratedAudi?.pricePerHour, 150000);

    const createHourlyBooking = (pickupTime: string, returnTime: string, email: string) =>
      fetch(`${migrationUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carId: 'car-audi-r8',
          pickupDate: '2032-03-01',
          returnDate: '2032-03-01',
          pickupTime,
          returnTime,
          durationUnit: 'hour',
          pickupLocation: 'Beverly Hills',
          returnLocation: 'Beverly Hills',
          extraServices: [],
          driverInfo: {
            fullName: 'Migration Customer',
            email,
            phone: '+10000000000',
            licenseNumber: 'MIGRATION-TEST',
            ageConfirmed: true
          },
          paymentMethod: 'Apple Pay'
        })
      });

    assert.equal((await createHourlyBooking('08:00 AM', '09:00 AM', 'before@example.test')).status, 201);
    assert.equal((await createHourlyBooking('11:00 AM', '12:00 PM', 'overlap@example.test')).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => {
      migrationServer.close((error) => error ? reject(error) : resolve());
    });
    instance.close();
  }
});
