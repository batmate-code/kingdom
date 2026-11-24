import { describe, expect, it } from 'vitest';
import { inviteFrom, inviteLink, netFrom, seatRoom } from './invite';
import { lazyLink, lazyListener, memoryNetwork, type Link } from './transport';

const loc = (url: string) => {
  const u = new URL(url);
  return { hash: u.hash, search: u.search };
};

describe('Онлайн: ссылки-приглашения', () => {
  it('Ключи — во фрагменте (#), строка запроса очищается; разбор возвращает их обратно', () => {
    const link = inviteLink('https://x.test/app/?autostart=1#old', 'r1', 'k1', 'webrtc');
    expect(link).toBe('https://x.test/app/#join=r1&key=k1');
    expect(inviteFrom(loc(link))).toEqual({ room: 'r1', key: 'k1' });
    expect(netFrom(loc(link))).toBe('webrtc');
  });

  it('Транспорт вкладок передаётся гостю; старые ссылки через ?join тоже читаются', () => {
    const link = inviteLink('http://localhost:5173/?net=tabs', 'r', 'k', 'tabs');
    expect(netFrom(loc(link))).toBe('tabs');
    expect(inviteFrom(loc('http://localhost:5173/?join=r&key=k'))).toEqual({ room: 'r', key: 'k' });
    expect(inviteFrom(loc('http://localhost:5173/'))).toBeNull();
  });

  it('Комната кресла зависит и от партии, и от кресла', () => {
    expect(seatRoom('a', 'b')).not.toBe(seatRoom('a', 'c'));
    expect(seatRoom('a', 'b')).not.toBe(seatRoom('d', 'b'));
  });
});

describe('Онлайн: ленивый транспорт', () => {
  it('Отправки до готовности соединения копятся и уходят по порядку; сообщения доходят', async () => {
    const net = memoryNetwork();
    const got: unknown[] = [];
    net.listener.onConnect((l) => l.onMessage((m) => got.push(m)));
    let resolve!: (l: Link) => void;
    const link = lazyLink(new Promise<Link>((r) => (resolve = r)));
    link.send({ n: 1 });
    link.send({ n: 2 });
    resolve(net.connect());
    await Promise.resolve();
    link.send({ n: 3 });
    expect(got).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('Закрытие до готовности: соединение закрывается сразу после появления; ошибка загрузки — onClose', async () => {
    const net = memoryNetwork();
    let resolve!: (l: Link) => void;
    const link = lazyLink(new Promise<Link>((r) => (resolve = r)));
    link.close();
    const real = net.connect();
    let realClosed = false;
    real.onClose(() => (realClosed = true));
    resolve(real);
    await Promise.resolve();
    expect(realClosed).toBe(true);

    let failedClosed = false;
    const failed = lazyLink(Promise.reject(new Error('нет сети')));
    failed.onClose(() => (failedClosed = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(failedClosed).toBe(true);
  });

  it('Ленивый слушатель передаёт соединения после загрузки', async () => {
    const net = memoryNetwork();
    const listener = lazyListener(Promise.resolve(net.listener));
    const seen: Link[] = [];
    listener.onConnect((l) => seen.push(l));
    await Promise.resolve();
    await Promise.resolve();
    net.connect();
    expect(seen).toHaveLength(1);
  });
});
