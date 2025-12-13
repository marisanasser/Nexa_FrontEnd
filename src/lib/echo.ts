import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { safeGetLocalStorage } from '../utils/browserUtils';

declare global {
    interface Window {
        Pusher: typeof Pusher;
    }
}

// Make Pusher available globally
window.Pusher = Pusher;

let echoInstance: any = null;

export const getEcho = () => {
    if (echoInstance) {
        return echoInstance;
    }

    // Get token from localStorage (redux persist or direct token key)
    let token = null;
    try {
        const reduxState = safeGetLocalStorage('persist:root');
        if (reduxState) {
            const parsedState = JSON.parse(reduxState);
            const authState = JSON.parse(parsedState.auth || '{}');
            if (authState.token) {
                token = JSON.parse(authState.token);
            }
        }
    } catch (e) {
        console.error('Error getting token for Echo from persist:root:', e);
    }

    if (!token) {
        token = safeGetLocalStorage('token');
    }

    if (!token) {
        return null;
    }

    const options = {
        broadcaster: 'reverb',
        key: import.meta.env.VITE_REVERB_APP_KEY,
        wsHost: import.meta.env.VITE_REVERB_HOST,
        wsPort: import.meta.env.VITE_REVERB_PORT ? parseInt(import.meta.env.VITE_REVERB_PORT) : 8080,
        wssPort: import.meta.env.VITE_REVERB_PORT ? parseInt(import.meta.env.VITE_REVERB_PORT) : 8080,
        forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        cluster: 'mt1',
        authEndpoint: `${import.meta.env.VITE_BACKEND_URL || 'https://nexacreators.com.br'}/api/broadcasting/auth`,
        auth: {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        },
    };

    echoInstance = new Echo(options as any);
    return echoInstance;
};

export const disconnectEcho = () => {
    if (echoInstance) {
        echoInstance.disconnect();
        echoInstance = null;
    }
};
