type EventHandler = (data?: unknown) => void;

// Events that should be micro-batched to avoid redundant re-renders
const BATCHED_EVENTS = new Set(["tasksChanged"]);

class EventBus {
  private subscribers: { [event: string]: EventHandler[] } = {};
  private pendingBatched: Set<string> = new Set();

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

    // For batched events, coalesce multiple calls in the same microtask
    if (BATCHED_EVENTS.has(event)) {
      if (!this.pendingBatched.has(event)) {
        this.pendingBatched.add(event);
        queueMicrotask(() => {
          this.pendingBatched.delete(event);
          if (this.subscribers[event]) {
            this.subscribers[event].forEach((subscriber) => subscriber(data));
          }
        });
      }
      return;
    }

    this.subscribers[event].forEach((subscriber) => subscriber(data));
  }
}

export const eventBus = new EventBus();
