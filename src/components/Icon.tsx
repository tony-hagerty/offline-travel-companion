const PATHS = {
  back: 'M15 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  // Two arrows chasing each other; symmetric so it sits centered in round buttons.
  refresh: 'M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16M3 21v-5h5',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  pin: 'M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 21l2-6 3 3v3M9 13l1-5 4 1 2 4M10 8l-3 2-1 3',
  car: 'M5 17h14M6 17v2M18 17v2M4 13l2-6h12l2 6v4H4v-4zM7.5 14.5h.01M16.5 14.5h.01',
  close: 'M6 6l12 12M18 6L6 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  directions: 'M12 2l10 10-10 10L2 12 12 2zM9 13v-2h5V9l3 3-3 3v-2H9',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  cloudOff: 'M3 3l18 18M17.5 17.5H7a5 5 0 0 1-1-9.9M9.8 5.4A6 6 0 0 1 18 10a4 4 0 0 1 2.6 6.9',
  check: 'M5 12l5 5L20 7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  calendar: 'M8 3v4M16 3v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
