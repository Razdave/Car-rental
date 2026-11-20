-- Aurevon — electric cars are no longer offered.
-- The app no longer lists an Electric category or fuel type; this makes the database refuse them too.
-- The 'Electric' enum value stays (Postgres can't drop enum values safely) but can't be used.
-- NOT VALID: existing rows aren't re-checked, so any legacy EV rows can still be hidden or removed;
-- every new or edited listing must be non-electric.
alter table public.cars
  add constraint cars_no_electric check (category <> 'Electric' and fuel_type <> 'Electric') not valid;
