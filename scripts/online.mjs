/**
 * Онлайн-партия с другом одной командой: `npm run online`.
 *
 * 1. Собирает интерфейс (packages/web) — всегда свежая версия кода.
 * 2. Запускает собранную версию локально (vite preview; dev-сервер наружу не открываем) и
 *    ретранслятор онлайн-партии (WebSocket /relay, packages/web/src/online/relayHub.ts):
 *    хост и гости связываются через этот сервер, без реле Nostr и прямого соединения браузеров.
 * 3. Поднимает временный https-туннель Cloudflare (без аккаунта) — бинарник cloudflared
 *    скачивается сам при первом запуске.
 * 4. Печатает публичный адрес и открывает его в браузере: в этой вкладке ты хост, ссылки
 *    для друга — кнопкой «пригласить» в шапке партии.
 *
 * Пока окно терминала открыто, ссылка работает. Ctrl+C — остановить. Адрес новый при каждом
 * запуске (старые приглашения перестают работать).
 */
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { bin, install, Tunnel } from 'cloudflared';
import { build, preview } from 'vite';
import { WebSocketServer } from 'ws';
import { createRelayHub } from '../packages/web/src/online/relayHub.ts';

const root = fileURLToPath(new URL('../packages/web/', import.meta.url));

console.log('1/3 Сборка игры…');
// Сборка со связью через ретранслятор этого сервера (invite.ts: BUILD_NET).
process.env.VITE_ONLINE_NET = 'relay';
await build({ root, logLevel: 'warn' });

console.log('2/3 Запуск собранной версии…');
const server = await preview({ root, logLevel: 'warn', preview: { port: 4173, open: false } });
const local = server.resolvedUrls?.local[0] ?? 'http://localhost:4173/';

// Ретранслятор: WebSocket на /relay?role=host|guest&room=… того же сервера (через туннель — wss).
const hub = createRelayHub(() => randomUUID());
/** Предел сообщения: снимок партии — около 5 КБ. */
const MAX_PAYLOAD = 1 << 20;
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
server.httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/relay') return; // остальное (горячая перезагрузка и т. п.) не наше
  const role = url.searchParams.get('role');
  const room = url.searchParams.get('room') ?? '';
  if (role !== 'host' && role !== 'guest') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const peer = hub.connect({ send: (d) => ws.send(d), close: () => ws.close() }, role, room);
    ws.on('message', (data) => peer.message(data.toString()));
    ws.on('close', () => peer.closed());
    ws.on('error', () => ws.close());
  });
});

if (!existsSync(bin)) {
  console.log('   Первый запуск: скачиваю cloudflared (один раз)…');
  await install(bin);
}

console.log('3/3 Туннель…');
const tunnel = Tunnel.quick(local);
tunnel.on('error', (e) => console.error('Ошибка туннеля:', e.message));
tunnel.on('exit', (code) => {
  console.log(`Туннель остановлен (код ${code ?? '—'}).`);
  void server.close().then(() => process.exit(code ?? 0));
});

/**
 * Адрес выдаётся раньше, чем туннель подключён и попал в DNS. Если открыть его сразу, система
 * запомнит ответ «такого адреса нет» на несколько минут. Ждём подключения и ещё немного.
 */
const DNS_SETTLE_MS = 8000;
// Подписываемся на оба события сразу: connected может прийти раньше, чем мы дождёмся url.
const urlReady = new Promise((resolve) => tunnel.once('url', resolve));
const connected = new Promise((resolve) => tunnel.once('connected', resolve));
const url = await urlReady;
await connected;
console.log('   Туннель подключён, жду, пока адрес появится в DNS…');
await new Promise((resolve) => setTimeout(resolve, DNS_SETTLE_MS));

{
  console.log('');
  console.log('  Игра доступна по адресу:');
  console.log(`  ${url}`);
  console.log('');
  console.log('  Открой его у себя (не localhost), начни партию с креслом «Гость по ссылке»');
  console.log('  и отправь другу ссылку из кнопки «пригласить». Ctrl+C — остановить.');
  console.log('');
  // Открыть в браузере по умолчанию.
  const opener =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(opener);
}

const stop = () => {
  console.log('\nОстанавливаю…');
  tunnel.stop();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
