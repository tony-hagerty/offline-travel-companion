import { openDB, type DBSchema } from 'idb';
import type { Trip } from '../types';
import { migrateTrip } from '../lib/trips';

// Trips live in IndexedDB (the browser's on-device database) so they work offline.
interface Schema extends DBSchema {
  trips: { key: string; value: Trip };
}

const dbPromise = openDB<Schema>('travel-companion', 1, {
  upgrade(db) {
    db.createObjectStore('trips', { keyPath: 'id' });
  },
});

export async function loadTrips(): Promise<Trip[]> {
  return (await (await dbPromise).getAll('trips')).map(migrateTrip);
}

export async function saveTrip(trip: Trip): Promise<void> {
  await (await dbPromise).put('trips', trip);
}

export async function removeTrip(id: string): Promise<void> {
  await (await dbPromise).delete('trips', id);
}

/** Asks the browser not to evict our data when storage runs low. */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => undefined);
}
