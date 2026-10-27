import { useEffect } from 'react';
import { init, useStore } from './data/store';
import { requestPersistentStorage } from './data/db';
import { useRoute } from './lib/router';
import { TripList } from './components/TripList';
import { TripForm } from './components/TripForm';
import { TripPage } from './components/TripPage';

export function App() {
  const route = useRoute();
  const { loaded } = useStore();

  // Location is only checked when she taps "Where am I?" or refresh, never on its own.
  useEffect(() => {
    requestPersistentStorage();
    void init();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route[0], route[1]]);

  if (!loaded) return null;

  const [page, id, sub, item] = route;
  if (page === 'new') return <TripForm />;
  if (page === 'trip' && id && sub === 'edit') return <TripForm key={id} tripId={id} />;
  if (page === 'trip' && id) return <TripPage tripId={id} tab={sub} itemId={item} />;
  return <TripList />;
}
