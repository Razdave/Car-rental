import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo, Server } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from './index.ts';

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
  assert.equal(booking.totalAmount, 608800);
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
        licenseNumber: 'TEST-456'
      },
      paymentMethod: 'Apple Pay'
    })
  });
  assert.equal(overlapResponse.status, 409);

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
