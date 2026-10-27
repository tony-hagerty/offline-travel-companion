import type { Listing, TravelMode } from '../types';

export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Opens directions in Apple Maps on iPhone, Google Maps elsewhere. */
export function directionsUrl(l: Pick<Listing, 'lat' | 'lon' | 'name'>, mode: TravelMode | 'transit', near?: string): string {
  if (l.lat === undefined || l.lon === undefined) {
    const q = encodeURIComponent([l.name, near].filter(Boolean).join(', '));
    return isIOS ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  if (isIOS) {
    const flag = { walk: 'w', car: 'd', transit: 'r' }[mode];
    return `https://maps.apple.com/?daddr=${l.lat},${l.lon}&dirflg=${flag}&q=${encodeURIComponent(l.name)}`;
  }
  const travelmode = { walk: 'walking', car: 'driving', transit: 'transit' }[mode];
  return `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}&travelmode=${travelmode}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export const GROUP_ICON: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  fast_food: '🍔',
  drinks: '🍷',
  sight: '🏛️',
  museum: '🖼️',
  park: '🌳',
  family: '🎡',
  activity: '🎟️',
  shop: '🛍️',
  lodging: '🛏️',
  rail: '🚆',
  tram: '🚊',
  bus: '🚌',
  ferry: '⛴️',
  transport: '🚉',
  event: '🎉',
};
