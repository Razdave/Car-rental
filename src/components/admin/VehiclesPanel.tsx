import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { Car, CarCategory } from '../../types/car';
import { backend, type CarInput } from '../../lib/backend';
import { formatNaira } from '../../utils/currency';
import { Field } from '../booking/BookingParts';
import { Button, cn } from '../ui/Button';
import { Card } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { Pill } from './AdminParts';
import { PackagesEditor } from './PackagesEditor';
import { PHOTO_CREDITS } from '../../data/photoCredits';

const CATEGORIES: Exclude<CarCategory, 'All'>[] = ['Sports', 'SUV', 'Luxury', 'Sedan'];

const BLANK: CarInput = {
  name: '', brand: '', model: '', year: new Date().getFullYear(), category: 'Luxury',
  pricePerDay: 0, pricePerHour: 0, powerHp: 0, acceleration0to100: 0, topSpeedKmH: 0,
  transmission: 'Automatic', fuelType: 'Petrol', seats: 5, doors: 4, color: '',
  imageUrl: '', galleryImages: [], description: '', features: [],
  rules: ['Minimum driver age 25', 'No smoking or pets', 'Return with the same fuel or charge level'],
  packages: [],
  location: '', isAvailable: true, isPopular: false, isFeatured: false, hostName: 'Aurevon Fleet', mileageLimit: '250 km / day'
};

interface Props {
  cars: Car[];
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

export const VehiclesPanel: React.FC<Props> = ({ cars, run }) => {
  const [editing, setEditing] = useState<CarInput | null>(null);
  const [lines, setLines] = useState({ features: '', rules: '' });
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const open = (car?: Car) => {
    const input: CarInput = car ? { ...car } : { ...BLANK };
    setEditing(input);
    setLines({ features: input.features.join('\n'), rules: (input.rules ?? []).join('\n') });
    setErrors({});
  };

  const set = <K extends keyof CarInput>(key: K, value: CarInput[K]) => setEditing((e) => (e ? { ...e, [key]: value } : e));
  const num = (key: keyof CarInput) => (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) as never);

  const photos = editing ? [editing.imageUrl, ...editing.galleryImages.filter((g) => g !== editing.imageUrl)].filter(Boolean) : [];
  const setPhotos = (list: string[]) => setEditing((e) => (e ? { ...e, imageUrl: list[0] ?? '', galleryImages: list } : e));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 8)) {
        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
        urls.push(await backend.admin.uploadCarImage(file));
      }
      setPhotos([...photos, ...urls]);
    } catch (e) {
      setErrors((x) => ({ ...x, photos: e instanceof Error ? e.message : 'Upload failed' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const e: Record<string, string> = {};
    if (!editing.name.trim()) e.name = 'Required';
    if (!editing.brand.trim()) e.brand = 'Required';
    if (!(editing.pricePerDay > 0)) e.pricePerDay = 'Enter a daily price';
    if (!(editing.pricePerHour > 0)) e.pricePerHour = 'Enter an hourly price';
    if (!photos.length) e.photos = 'Add at least one photo';
    if ((editing.packages ?? []).some((p) => p.name.trim().length < 2 || !(p.price > 0) || !(p.duration >= 1)))
      e.packages = 'Each package needs a name, a length and a price.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const toList = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);
    const ok = await run(
      () =>
        backend.admin.saveCar({
          ...editing,
          features: toList(lines.features),
          rules: toList(lines.rules),
          name: editing.name.trim(),
          model: editing.model.trim() || editing.name.trim(),
          packages: (editing.packages ?? []).map((p) => ({ ...p, name: p.name.trim(), includes: p.includes.map((i) => i.trim()).filter(Boolean) }))
        }),
      editing.id ? 'Listing updated' : 'Vehicle added to the fleet'
    );
    if (ok) setEditing(null);
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => open()}>
          <Plus className="size-5" /> Add vehicle
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cars.map((c) => (
          <Card key={c.id} className="overflow-hidden">
            <img src={c.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{c.name}</p>
                  <p className="text-sm text-ink-soft">{c.category} · {c.galleryImages.length || 1} photos</p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Pill className={c.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-2 text-ink-muted'}>{c.isAvailable ? 'Listed' : 'Hidden'}</Pill>
                  {PHOTO_CREDITS[c.imageUrl] && <Pill className="bg-amber-50 text-amber-800">Stand-in photo</Pill>}
                </span>
              </div>
              <p className="mt-2 text-sm">
                <strong>{formatNaira(c.pricePerDay)}</strong>/day · <strong>{formatNaira(c.pricePerHour)}</strong>/hr
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft">
                <Star className="size-4 fill-amber-400 text-amber-400" /> {c.rating.toFixed(2)} ({c.reviewCount})
              </p>
              <Button variant="secondary" size="sm" block className="mt-3" onClick={() => open(c)}>
                <Pencil className="size-4" /> Edit listing
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} size="lg" title={editing?.id ? 'Edit listing' : 'Add vehicle'} description="Photos, pricing, rules and availability">
        {editing && (
          <form id="car-form" onSubmit={save} className="space-y-6">
            <section>
              <p className="mb-1 text-sm font-bold text-ink-muted">Photos</p>
              <p className="mb-2 text-sm text-ink-soft">
                Landscape, at least 1600 px wide. Use the front three-quarter shot as the cover, and shoot every car in the same spot at your car stand. Full checklist: docs/PHOTO_GUIDE.md.
              </p>
              {PHOTO_CREDITS[editing.imageUrl] && (
                <p className="mb-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900">This car still uses a stand-in photo. Add photos of your own car, make one the cover, and delete the stand-in.</p>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p, i) => (
                  <div key={p + i} className="group relative overflow-hidden rounded-xl border border-line">
                    <img src={p} alt="" className="aspect-[4/3] w-full object-cover" />
                    {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">Cover</span>}
                    <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 p-1">
                      {i > 0 && (
                        <button type="button" onClick={() => setPhotos([p, ...photos.filter((_, j) => j !== i)])} className="min-h-8 rounded-lg bg-white/90 px-2 text-xs font-bold">
                          Make cover
                        </button>
                      )}
                      <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="flex size-8 items-center justify-center rounded-lg bg-white/90 text-brand">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-sm font-bold text-ink-muted hover:border-ink-faint"
                >
                  {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                  {uploading ? 'Uploading…' : 'Add photos'}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} />
              {errors.photos && <p className="mt-1.5 text-sm font-semibold text-brand">{errors.photos}</p>}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Field label="Listing name" error={errors.name} className="col-span-2">
                <input className="field" value={editing.name} onChange={(e) => set('name', e.target.value)} placeholder="Mercedes-AMG G63" />
              </Field>
              <Field label="Brand" error={errors.brand}><input className="field" value={editing.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
              <Field label="Model"><input className="field" value={editing.model} onChange={(e) => set('model', e.target.value)} /></Field>
              <Field label="Year"><input className="field" type="number" min={1990} max={2100} value={editing.year} onChange={num('year')} /></Field>
              <Field label="Category">
                <select className="field" value={editing.category} onChange={(e) => set('category', e.target.value as CarCategory)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Colour"><input className="field" value={editing.color} onChange={(e) => set('color', e.target.value)} /></Field>
              <Field label="Location"><input className="field" value={editing.location} onChange={(e) => set('location', e.target.value)} placeholder="Victoria Island, Lagos" /></Field>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Field label="Price per day (₦)" error={errors.pricePerDay}><input className="field" type="number" min={0} step={1000} inputMode="numeric" value={editing.pricePerDay || ''} onChange={num('pricePerDay')} /></Field>
              <Field label="Price per hour (₦)" error={errors.pricePerHour}><input className="field" type="number" min={0} step={1000} inputMode="numeric" value={editing.pricePerHour || ''} onChange={num('pricePerHour')} /></Field>
              <Field label="Security deposit (₦)" hint="Leave empty for the category default" className="col-span-2">
                <input className="field" type="number" min={0} step={10000} inputMode="numeric" value={editing.depositAmount ?? ''} onChange={(e) => set('depositAmount', e.target.value === '' ? undefined : Number(e.target.value))} />
              </Field>
              <Field label="Mileage allowance" className="col-span-2"><input className="field" value={editing.mileageLimit} onChange={(e) => set('mileageLimit', e.target.value)} /></Field>
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Power (hp)"><input className="field" type="number" min={0} value={editing.powerHp || ''} onChange={num('powerHp')} /></Field>
              <Field label="0–100 (s)"><input className="field" type="number" min={0} step={0.1} value={editing.acceleration0to100 || ''} onChange={num('acceleration0to100')} /></Field>
              <Field label="Top speed (km/h)"><input className="field" type="number" min={0} value={editing.topSpeedKmH || ''} onChange={num('topSpeedKmH')} /></Field>
              <Field label="Seats"><input className="field" type="number" min={1} max={9} value={editing.seats} onChange={num('seats')} /></Field>
              <Field label="Doors"><input className="field" type="number" min={2} max={5} value={editing.doors} onChange={num('doors')} /></Field>
              <Field label="Gearbox">
                <select className="field" value={editing.transmission} onChange={(e) => set('transmission', e.target.value as Car['transmission'])}>
                  <option>Automatic</option><option>Manual</option>
                </select>
              </Field>
              <Field label="Fuel">
                <select className="field" value={editing.fuelType} onChange={(e) => set('fuelType', e.target.value as Car['fuelType'])}>
                  <option>Petrol</option><option>Hybrid</option><option>Diesel</option>
                </select>
              </Field>
            </section>

            <PackagesEditor packages={editing.packages ?? []} onChange={(packages) => set('packages', packages)} standardDaily={editing.pricePerDay} standardHourly={editing.pricePerHour} />
            {errors.packages && <p className="-mt-3 text-sm font-semibold text-brand">{errors.packages}</p>}

            <Field label="Description"><textarea className="field min-h-24" value={editing.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Features" hint="One per line"><textarea className="field min-h-32" value={lines.features} onChange={(e) => setLines({ ...lines, features: e.target.value })} /></Field>
              <Field label="Rental rules" hint="One per line — shown on the listing and in the agreement"><textarea className="field min-h-32" value={lines.rules} onChange={(e) => setLines({ ...lines, rules: e.target.value })} /></Field>
            </div>

            <section className="space-y-2">
              {([
                ['isAvailable', 'Listed and bookable', 'Turn off to hide it from customers (e.g. sold or long repair)'],
                ['isPopular', 'Show in “Popular right now”', ''],
                ['isFeatured', 'Featured', '']
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-0.5 size-5 accent-brand" checked={Boolean(editing[key])} onChange={(e) => set(key, e.target.checked)} />
                  <span className="text-sm">
                    <span className="font-bold">{label}</span>
                    {hint && <span className="block text-ink-soft">{hint}</span>}
                  </span>
                </label>
              ))}
            </section>

            <div className={cn('pb-safe sticky bottom-0 -mx-5 flex gap-2 border-t border-line bg-white px-5 pt-3 sm:-mx-6 sm:px-6')}>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={uploading}>{editing.id ? 'Save changes' : 'Add vehicle'}</Button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
};
