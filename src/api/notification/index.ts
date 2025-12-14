import axios from 'axios';

const BackendURL = import.meta.env.VITE_BACKEND_URL || "https://nexacreators.com.br";


const NotificationAPI = axios.create({
    baseURL: BackendURL,
    headers: {
        'Content-Type': 'application/json',
    },
});


const setAuthToken = (token: string) => {
    if (token) {
        NotificationAPI.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        delete NotificationAPI.defaults.headers.common['Authorization'];
    }
};


export const getNotifications = async (token: string, params?: {
    per_page?: number;
    type?: string;
    is_read?: boolean;
}) => {
    setAuthToken(token);
    const response = await NotificationAPI.get('/api/notifications', { params });
    return response.data;
};


export const getUnreadCount = async (token: string) => {
    setAuthToken(token);
    const response = await NotificationAPI.get('/api/notifications/unread-count');
    return response.data;
};


export const markAsRead = async (notificationId: number, token: string) => {
    setAuthToken(token);
    const response = await NotificationAPI.post(`/api/notifications/${notificationId}/mark-read`);
    return response.data;
};


export const markAllAsRead = async (token: string) => {
    setAuthToken(token);
    const response = await NotificationAPI.post('/api/notifications/mark-all-read');
    return response.data;
};


export const deleteNotification = async (notificationId: number, token: string) => {
    setAuthToken(token);
    const response = await NotificationAPI.delete(`/api/notifications/${notificationId}`);
    return response.data;
};


export const getNotificationStatistics = async (token: string) => {
    setAuthToken(token);
    const response = await NotificationAPI.get('/api/notifications/statistics');
    return response.data;
}; 
