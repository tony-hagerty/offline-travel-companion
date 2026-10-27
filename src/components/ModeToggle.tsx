import type { TravelMode } from '../types';
import { Icon } from './Icon';

export function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: TravelMode;
  onChange: (m: TravelMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Getting around">
      {(['walk', 'car'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={value === m}
          className={value === m ? 'on' : ''}
          onClick={() => onChange(m)}
          disabled={disabled}
        >
          <Icon name={m} size={18} /> {m === 'walk' ? 'Walk' : 'Car'}
        </button>
      ))}
    </div>
  );
}
