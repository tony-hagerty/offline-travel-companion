import { useEffect, useRef } from 'react';
import type { Listing, Trip, Units } from '../types';
import { formatDistance } from '../lib/geo';
import { GROUP_ICON, directionsUrl, telUrl } from '../lib/links';
import { Icon } from './Icon';

export function ListingDetail({
  listing: l,
  trip,
  units,
  onClose,
}: {
  listing: Listing;
  trip: Trip;
  units: Units;
  onClose: () => void;
}) {
  // The parent passes a new onClose each render; read it through a ref so the effect runs once.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);

  const transit = l.group === 'rail' || l.group === 'bus' || l.group === 'tram' || l.group === 'ferry';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={l.name} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn sheet-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        {l.image && (
          <img className="sheet-image" src={l.image} alt="" crossOrigin="anonymous" onError={(e) => (e.currentTarget.style.display = 'none')} />
        )}
        <div className="sheet-body">
          <div className="sheet-eyebrow">
            <span aria-hidden="true">{GROUP_ICON[l.group] ?? '📍'}</span> {l.category}
            {l.guidePick && <span className="pick-badge">★ Guide pick</span>}
          </div>
          <h2>{l.name}</h2>
          {l.distance !== undefined && <div className="muted">{formatDistance(l.distance, trip.mode, units)} from {trip.kind === 'current' ? 'you' : trip.place.name}</div>}

          <div className="actions">
            <a className="primary-btn small" href={directionsUrl(l, transit ? 'walk' : trip.mode, trip.place.label)} target="_blank" rel="noreferrer">
              <Icon name="directions" size={18} /> Directions
            </a>
            {l.phone && (
              <a className="secondary-btn small" href={telUrl(l.phone)}>
                <Icon name="phone" size={18} /> Call
              </a>
            )}
            {l.website && (
              <a className="secondary-btn small" href={l.website} target="_blank" rel="noreferrer">
                <Icon name="external" size={18} /> Website
              </a>
            )}
          </div>

          {l.description && <p className="description">{l.description}</p>}

          <dl className="facts">
            {l.event && (
              <>
                <dt>When</dt>
                <dd>
                  {l.event.when ?? 'Dates not listed'}
                  <div className="muted small">Dates can change from year to year. Check before you go.</div>
                </dd>
              </>
            )}
            {(l.price || l.priceTier) && (
              <>
                <dt>Price</dt>
                <dd>
                  {l.priceTier && <span className="price-tier">{'$'.repeat(l.priceTier)}</span>} {l.price}
                </dd>
              </>
            )}
            {l.hours && !l.event && (
              <>
                <dt>Hours</dt>
                <dd>
                  {l.hours.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </dd>
              </>
            )}
            {l.address && (
              <>
                <dt>Address</dt>
                <dd>{l.address}</dd>
              </>
            )}
            {l.phone && (
              <>
                <dt>Phone</dt>
                <dd>
                  <a href={telUrl(l.phone)}>{l.phone}</a>
                </dd>
              </>
            )}
            {l.extra && l.extra.length > 0 && (
              <>
                <dt>Details</dt>
                <dd>{l.extra.join(' · ')}</dd>
              </>
            )}
          </dl>

          <div className="source-links">
            {l.wikipedia && (
              <a href={l.wikipedia} target="_blank" rel="noreferrer">
                Wikipedia <Icon name="external" size={14} />
              </a>
            )}
            {l.lat !== undefined && (
              <a href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=18/${l.lat}/${l.lon}`} target="_blank" rel="noreferrer">
                Map <Icon name="external" size={14} />
              </a>
            )}
          </div>
          <p className="credit">
            {l.source === 'wikivoyage' ? 'Listing from Wikivoyage' : 'Listing from OpenStreetMap'}. Hours and prices can change.
          </p>
        </div>
      </div>
    </div>
  );
}
