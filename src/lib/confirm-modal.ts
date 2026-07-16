export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmResolver = (confirmed: boolean) => void;

let openFn: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

export function setConfirmFn(fn: (options: ConfirmOptions) => Promise<boolean>): void {
  openFn = fn;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!openFn) {
    return Promise.resolve(window.confirm(options.description));
  }
  return openFn(options);
}