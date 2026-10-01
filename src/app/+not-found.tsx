import { Redirect } from 'expo-router';

/** Unbekannte Adresse (z.B. Browser-Vorschau unter fremdem Pfad) → Timer. */
export default function NotFound() {
  return <Redirect href="/" />;
}
