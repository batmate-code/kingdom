/** Случайный ключ (комната, ключ кресла): 128 бит в шестнадцатеричной записи. */
export function newKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
