/**
 * Ссылки-приглашения онлайн-партии. Параметры лежат во фрагменте адреса (после #): фрагмент не
 * уходит на сервер и в его журналы, а ключ кресла — секрет. Без зависимостей (их читает и store).
 *
 * Формат: #join=<ключ партии>&key=<ключ кресла>[&net=tabs].
 */

/** Способ связи: вкладки одного браузера, ретранслятор сервера `npm run online`, WebRTC. */
export type Net = 'tabs' | 'relay' | 'webrtc';

/**
 * Способ по умолчанию задаёт сборка: `npm run online` собирает с VITE_ONLINE_NET=relay
 * (у неё есть свой сервер), обычная сборка и dev-сервер — WebRTC.
 */
const BUILD_NET: Net = import.meta.env.VITE_ONLINE_NET === 'relay' ? 'relay' : 'webrtc';

/** Комната одного кресла: ключ партии + ключ кресла (оба секретны, знают только хост и гость). */
export const seatRoom = (room: string, seatKey: string): string => `${room}-${seatKey}`;

/** Параметры адреса: фрагмент (новые ссылки) и строка запроса (старые ссылки и ?net=tabs). */
function params(loc: Pick<Location, 'hash' | 'search'>): URLSearchParams {
  const p = new URLSearchParams(loc.search);
  for (const [k, v] of new URLSearchParams(loc.hash.replace(/^#/, ''))) p.set(k, v);
  return p;
}

/** Приглашение из адреса страницы (null — страница открыта не по приглашению). */
export function inviteFrom(
  loc: Pick<Location, 'hash' | 'search'>,
): { room: string; key: string } | null {
  const p = params(loc);
  const room = p.get('join');
  const key = p.get('key');
  return room && key ? { room, key } : null;
}

/** Транспорт из адреса (net=tabs | relay | webrtc), иначе — способ сборки. */
export function netFrom(loc: Pick<Location, 'hash' | 'search'>): Net {
  const net = params(loc).get('net');
  return net === 'tabs' || net === 'relay' || net === 'webrtc' ? net : BUILD_NET;
}

/** Ссылка-приглашение для кресла: тот же адрес приложения, параметры во фрагменте. */
export function inviteLink(base: string, room: string, key: string, net: Net): string {
  const url = new URL(base);
  url.search = '';
  const p = new URLSearchParams({ join: room, key });
  // Гость подключается тем же способом, что и хост (если он не совпадает со способом сборки).
  if (net !== BUILD_NET) p.set('net', net);
  url.hash = p.toString();
  return url.toString();
}
