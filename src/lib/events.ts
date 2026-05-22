type EventHandler = (data?: unknown) => void;

const BATCHED_EVENTS = new Set(["tasksChanged", "userSettingsChanged", "appSettingsChanged"]);
const DEBOUNCE_MS = 100;

class EventBus {
  private subscribers: { [event: string]: EventHandler[] } = {};
  private pendingBatched: Set<string> = new Set();
  private debounceTimers: { [event: string]: ReturnType<typeof setTimeout> } = {};

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

    if (BATCHED_EVENTS.has(event)) {
      if (this.debounceTimers[event]) {
        clearTimeout(this.debounceTimers[event]);
      }
      this.debounceTimers[event] = setTimeout(() => {
        delete this.debounceTimers[event];
        if (this.subscribers[event]) {
          this.subscribers[event].forEach((subscriber) => {
            subscriber(data);
          });
        }
      }, DEBOUNCE_MS);
      return;
    }

    this.subscribers[event].forEach((subscriber) => {
      subscriber(data);
    });
  }
}

export const eventBus = new EventBus();
