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

/** Несколько слушателей как один (хост слушает отдельную комнату на каждое кресло гостя). */
export function mergeListeners(listeners: readonly Listener[]): Listener {
  return {
    onConnect(h) {
      const offs = listeners.map((l) => l.onConnect(h));
      return () => offs.forEach((off) => off());
    },
    close() {
      for (const l of listeners) l.close();
    },
  };
}

/**
 * Соединение, которое появится позже (транспорт грузится лениво): отправки копятся в очереди,
 * подписки переносятся на настоящее соединение, когда оно готово.
 */
export function lazyLink(ready: Promise<Link>): Link {
  let link: Link | null = null;
  let closed = false;
  const queue: unknown[] = [];
  const message = handlers<[unknown]>();
  const close = handlers<[]>();
  void ready.then(
    (l) => {
      if (closed) {
        l.close();
        return;
      }
      link = l;
      l.onMessage((m) => message.emit(m));
      l.onClose(() => close.emit());
      for (const m of queue.splice(0)) l.send(m);
    },
    () => close.emit(),
  );
  return {
    send(m) {
      if (link) link.send(m);
      else if (!closed) queue.push(m);
    },
    onMessage: (h) => message.add(h),
    onClose: (h) => close.add(h),
    close() {
      closed = true;
      if (link) link.close();
      else close.emit();
    },
  };
}

/** Слушатель, который появится позже (см. lazyLink). */
export function lazyListener(ready: Promise<Listener>): Listener {
  let listener: Listener | null = null;
  let closed = false;
  const connects = handlers<[Link]>();
  void ready.then((l) => {
    if (closed) {
      l.close();
      return;
    }
    listener = l;
    l.onConnect((link) => connects.emit(link));
  });
  return {
    onConnect: (h) => connects.add(h),
    close() {
      closed = true;
      listener?.close();
    },
  };
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
