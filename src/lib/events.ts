type EventHandler = (data?: unknown) => void;

class EventBus {
  private subscribers: { [event: string]: EventHandler[] } = {};

  subscribe(event: string, callback: EventHandler) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(callback);
  }

  unsubscribe(event: string, callback: EventHandler) {
    if (!this.subscribers[event]) {
      return;
    }
    this.subscribers[event] = this.subscribers[event].filter(
      (subscriber) => subscriber !== callback
    );
  }

  publish(event: string, data?: unknown) {
    if (!this.subscribers[event]) {
      return;
    }
    this.subscribers[event].forEach((subscriber) => subscriber(data));
  }
}

export const eventBus = new EventBus();
