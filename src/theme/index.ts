import { useColorScheme } from 'react-native';

const light = {
  background: '#F4F5F7',
  card: '#FFFFFF',
  text: '#16181D',
  muted: '#6B7280',
  border: '#E3E5E8',
  primary: '#2563EB',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#EA580C',
  track: '#E5E7EB',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#0F1115',
  card: '#1A1D23',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  border: '#2A2E36',
  primary: '#3B82F6',
  onPrimary: '#FFFFFF',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F97316',
  track: '#2A2E36',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Farbauswahl für Projekte & andere Merkmal-Werte. */
export const VALUE_COLORS = [
  '#2563EB',
  '#16A34A',
  '#EA580C',
  '#9333EA',
  '#DB2777',
  '#0891B2',
  '#CA8A04',
  '#DC2626',
  '#4F46E5',
  '#65A30D',
];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

/** Feste Farbe pro Auftragsnummer – so sind Kacheln desselben Auftrags auf einen Blick erkennbar. */
export function orderColor(orderNo: string | null | undefined): string | null {
  if (!orderNo) return null;
  let h = 0;
  for (let i = 0; i < orderNo.length; i++) h = (h * 31 + orderNo.charCodeAt(i)) >>> 0;
  return VALUE_COLORS[h % VALUE_COLORS.length];
}
