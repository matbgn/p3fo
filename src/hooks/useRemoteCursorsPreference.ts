import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'p3fo_show_remote_cursors';
const CHANGE_EVENT = 'p3fo:remoteCursorPreferenceChanged';

// In-memory fallback for browsers where localStorage is unavailable.
let fallbackPreference = true;

const readStoredPreference = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored === null ? fallbackPreference : stored !== 'false';
    } catch {
        return fallbackPreference;
    }
};

const subscribe = (onStoreChange: () => void) => {
    window.addEventListener('storage', onStoreChange);
    window.addEventListener(CHANGE_EVENT, onStoreChange);
    return () => {
        window.removeEventListener('storage', onStoreChange);
        window.removeEventListener(CHANGE_EVENT, onStoreChange);
    };
};

const getServerSnapshot = () => true;

/**
 * Local-only preference controlling whether other users' awareness cursors
 * are rendered. Collaboration and Yjs awareness keep running untouched.
 */
export function useRemoteCursorsPreference() {
    const showRemoteCursors = useSyncExternalStore(
        subscribe,
        readStoredPreference,
        getServerSnapshot,
    );

    const setShowRemoteCursors = useCallback((show: boolean) => {
        fallbackPreference = show;
        try {
            window.localStorage.setItem(STORAGE_KEY, String(show));
        } catch {
            // Storage may be unavailable (private mode): the in-memory fallback applies.
        }
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }, []);

    return { showRemoteCursors, setShowRemoteCursors };
}
