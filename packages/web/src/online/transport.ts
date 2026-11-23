/**
 * Транспорт онлайн-партии: соединение «хост ↔ один гость». Реализации — в памяти (тесты),
 * BroadcastChannel (два окна одного браузера), WebRTC (этап 3). Сессии про них не знают.
 */

/** Одно соединение. Сообщения — простые JSON-объекты. */
export interface Link {
  send(message: unknown): void;
  /** Подписка на сообщения; возвращает отписку. */
  onMessage(handler: (message: unknown) => void): () => void;
  /** Соединение закрыто (с любой стороны). */
  onClose(handler: () => void): () => void;
  close(): void;
}

/** Сторона хоста: принимает новые соединения гостей. */
export interface Listener {
  onConnect(handler: (link: Link) => void): () => void;
  close(): void;
}

/** Небольшой помощник: список подписчиков с отпиской. */
export function handlers<T extends unknown[]>() {
  const list = new Set<(...args: T) => void>();
  return {
    add(h: (...args: T) => void): () => void {
      list.add(h);
      return () => list.delete(h);
    },
    emit(...args: T): void {
      for (const h of [...list]) h(...args);
    },
    clear(): void {
      list.clear();
    },
  };
}

/**
 * Транспорт в памяти: хост-слушатель и функция «подключиться гостем». Каждое сообщение проходит
 * через JSON, как по сети (иначе стороны делили бы объекты и тест ничего не доказал бы).
 */
export function memoryNetwork(): { listener: Listener; connect(): Link } {
  const connects = handlers<[Link]>();
  const listener: Listener = {
    onConnect: (h) => connects.add(h),
    close: () => connects.clear(),
  };

  function connect(): Link {
    const toHost = handlers<[unknown]>();
    const toGuest = handlers<[unknown]>();
    const closed = handlers<[]>();
    let open = true;
    const shut = () => {
      if (!open) return;
      open = false;
      closed.emit();
    };
    const wire = (message: unknown) => JSON.parse(JSON.stringify(message)) as unknown;
    const hostSide: Link = {
      send: (m) => open && toGuest.emit(wire(m)),
      onMessage: (h) => toHost.add(h),
      onClose: (h) => closed.add(h),
      close: shut,
    };
    const guestSide: Link = {
      send: (m) => open && toHost.emit(wire(m)),
      onMessage: (h) => toGuest.add(h),
      onClose: (h) => closed.add(h),
      close: shut,
    };
    connects.emit(hostSide);
    return guestSide;
  }

  return { listener, connect };
}
