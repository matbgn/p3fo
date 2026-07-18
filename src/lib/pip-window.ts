import { eventBus } from '@/lib/events';

const PIP_NORMAL_WIDTH = 120;
const PIP_NORMAL_HEIGHT = 100;

type PiPCallback = (pipWindow: Window) => void;
type PiPCloseCallback = () => void;

interface ScreenInfo {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  devicePixelRatio: number;
}

class PiPWindowService {
  private pipWindow: Window | null = null;
  private container: HTMLDivElement | null = null;
  private onOpenCallbacks: PiPCallback[] = [];
  private onCloseCallbacks: PiPCloseCallback[] = [];
  private screenInfo: ScreenInfo | null = null;

  get isSupported(): boolean {
    return 'documentPictureInPicture' in window;
  }

  get isActive(): boolean {
    return this.pipWindow !== null && !this.pipWindow.closed;
  }

  get getWindow(): Window | null {
    return this.pipWindow;
  }

  get getContainer(): HTMLDivElement | null {
    return this.container;
  }

  focus(): void {
    if (this.pipWindow && !this.pipWindow.closed) {
      this.pipWindow.focus();
    }
  }

  /**
   * Re-focuses the PiP window to bring it to the foreground. Useful when
   * the main window steals focus (e.g., after closing a dialog).
   */
  refocus(): void {
    if (this.pipWindow && !this.pipWindow.closed) {
      this.pipWindow.focus();
    }
  }

  getScreenInfo(): ScreenInfo | null {
    return this.screenInfo;
  }

  onOpen(callback: PiPCallback): () => void {
    this.onOpenCallbacks.push(callback);
    return () => {
      this.onOpenCallbacks = this.onOpenCallbacks.filter(cb => cb !== callback);
    };
  }

  onClose(callback: PiPCloseCallback): () => void {
    this.onCloseCallbacks.push(callback);
    return () => {
      this.onCloseCallbacks = this.onCloseCallbacks.filter(cb => cb !== callback);
    };
  }

  private captureScreenInfo(): ScreenInfo {
    const info: ScreenInfo = {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
    this.screenInfo = info;
    return info;
  }

  /**
   * Open the PiP window at the configured or default size.
   * Pass width/height to override the default (320×400).
   */
  async open(width?: number, height?: number): Promise<Window | null> {
    if (!this.isSupported) {
      console.warn('[PiP] Document PiP API is not supported in this browser');
      return null;
    }

    if (this.isActive) {
      this.pipWindow!.focus();
      return this.pipWindow;
    }

    this.captureScreenInfo();

    try {
      const docPiP = (window as unknown as Record<string, unknown>).documentPictureInPicture as
        | { requestWindow(options: { width: number; height: number }): Promise<Window> }
        | undefined;

      if (!docPiP) {
        console.warn('[PiP] Document PiP API is not available');
        return null;
      }

      this.pipWindow = await docPiP.requestWindow({
        width: width ?? PIP_NORMAL_WIDTH,
        height: height ?? PIP_NORMAL_HEIGHT,
      });

      this.copyStylesheets();

      this.container = this.pipWindow.document.createElement('div');
      this.container.id = 'pip-root';
      this.container.style.width = '100%';
      this.container.style.height = '100%';
      this.pipWindow.document.body.style.margin = '0';
      this.pipWindow.document.body.style.padding = '0';
      this.pipWindow.document.body.style.overflow = 'hidden';
      this.pipWindow.document.documentElement.style.height = '100%';
      this.pipWindow.document.body.style.height = '100%';
      this.pipWindow.document.body.appendChild(this.container);

      this.pipWindow.addEventListener('pagehide', () => {
        this.handleClose();
      });

      eventBus.publish('pipWindowOpened', {
        width: width ?? PIP_NORMAL_WIDTH,
        height: height ?? PIP_NORMAL_HEIGHT,
      });

      for (const callback of this.onOpenCallbacks) {
        callback(this.pipWindow);
      }

      return this.pipWindow;
    } catch (error) {
      console.error('[PiP] Failed to open PiP window:', error);
      this.pipWindow = null;
      return null;
    }
  }

  close(): void {
    if (this.pipWindow && !this.pipWindow.closed) {
      this.pipWindow.close();
    }
    this.handleClose();
  }

  private handleClose(): void {
    this.pipWindow = null;
    this.container = null;
    this.onCloseCallbacks.forEach(cb => cb());
    eventBus.publish('pipWindowClosed', {});
  }

  private copyStylesheets(): void {
    if (!this.pipWindow) return;

    const mainDoc = window.document;
    const pipDoc = this.pipWindow.document;

    Array.from(mainDoc.styleSheets).forEach((styleSheet) => {
      try {
        if (styleSheet.href) {
          const link = pipDoc.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          pipDoc.head.appendChild(link);
        } else {
          const style = pipDoc.createElement('style');
          Array.from(styleSheet.cssRules).forEach((rule) => {
            style.appendChild(pipDoc.createTextNode(rule.cssText));
          });
          pipDoc.head.appendChild(style);
        }
      } catch {
        const link = pipDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = styleSheet.href || '';
        pipDoc.head.appendChild(link);
      }
    });
  }
}

export const pipService = new PiPWindowService();