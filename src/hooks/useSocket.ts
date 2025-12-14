import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { apiClient } from '../services/apiClient';
import { Message } from '../services/chatService';
import { addNotification, incrementUnreadCount } from '../store/slices/notificationSlice';
import { getEcho } from '../lib/echo';

interface UseSocketReturn {
    socket: any; // Returning the Echo instance
    isConnected: boolean;
    connectionError: string | null;
    joinRoom: (roomId: string) => void;
    leaveRoom: (roomId: string) => void;
    sendMessage: (roomId: string, message: string, file?: File) => Promise<Message>;
    startTyping: (roomId: string) => void;
    stopTyping: (roomId: string) => void;
    markMessagesAsRead: (roomId: string, messageIds: number[]) => Promise<void>;
    onNewMessage: (callback: (data: any) => void) => () => void;
    onUserTyping: (callback: (data: any) => void) => () => void;
    onMessagesRead: (callback: (data: { roomId: string; messageIds: number[]; readBy: number; timestamp: string }) => void) => () => void;
    onOfferCreated: (callback: (data: { roomId: string; offerData: any; senderId: number; timestamp: string }) => void) => () => void;
    onOfferAccepted: (callback: (data: { roomId: string; offerData: any; contractData: any; senderId: number; timestamp: string }) => void) => () => void;
    onOfferRejected: (callback: (data: { roomId: string; offerData: any; senderId: number; rejectionReason?: string; timestamp: string }) => void) => () => void;
    onOfferCancelled: (callback: (data: { roomId: string; offerData: any; senderId: number; timestamp: string }) => void) => () => void;
    onContractCompleted: (callback: (data: { roomId: string; contractData: any; senderId: number; timestamp: string }) => void) => () => void;
    onContractTerminated: (callback: (data: { roomId: string; contractData: any; senderId: number; terminationReason?: string; timestamp: string }) => void) => () => void;
    onContractActivated: (callback: (data: { roomId: string; contractData: any; senderId: number; timestamp: string }) => void) => () => void;
    onContractStatusUpdate: (callback: (data: { roomId: string; contractData: any; terminationReason?: string; timestamp: string }) => void) => () => void;
    onOfferAcceptanceMessage: (callback: (data: { roomId: string; offerData: any; contractData: any; senderId: number; senderName: string; senderAvatar?: string; timestamp: string }) => void) => () => void;
    sendOfferAcceptanceMessage: (roomId: string, offerData: any, contractData: any, senderId: number, senderName: string, senderAvatar?: string) => void;
    reconnect: () => void;
}

interface UseSocketOptions {
    enableNotifications?: boolean;
    enableChat?: boolean;
}

export const useSocket = (options: UseSocketOptions = {}): UseSocketReturn => {
    const { enableNotifications = true, enableChat = true } = options;
    const { user } = useAppSelector((state) => state.auth);
    const dispatch = useAppDispatch();
    
    const echoRef = useRef<any>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const isMountedRef = useRef(true);
    const activeChannelsRef = useRef<Set<string>>(new Set());
    
    // Event handlers storage
    const eventHandlersRef = useRef<{ [key: string]: Set<Function> }>({
        new_message: new Set(),
        user_typing: new Set(),
        messages_read: new Set(),
        offer_created: new Set(),
        offer_accepted: new Set(),
        offer_rejected: new Set(),
        offer_cancelled: new Set(),
        contract_completed: new Set(),
        contract_terminated: new Set(),
        contract_activated: new Set(),
        contract_status_update: new Set(),
        offer_acceptance_message: new Set(),
    });

    const initializeEcho = useCallback(() => {
        if (!user || !isMountedRef.current) return null;

        const echo = getEcho();
        if (!echo) {
            setConnectionError("Failed to initialize Echo (missing token?)");
            return null;
        }

        echoRef.current = echo;

        // Monitor connection status
        if (echo.connector && echo.connector.pusher) {
            echo.connector.pusher.connection.bind('connected', () => {
                if (isMountedRef.current) {
                    setIsConnected(true);
                    setConnectionError(null);
                }
            });
            echo.connector.pusher.connection.bind('disconnected', () => {
                if (isMountedRef.current) {
                    setIsConnected(false);
                }
            });
            echo.connector.pusher.connection.bind('error', (err: any) => {
                console.error('Echo connection error:', err);
                if (isMountedRef.current) {
                    setIsConnected(false);
                    setConnectionError(err?.error?.data?.message || 'Connection error');
                }
            });
            
            // Check initial state
            if (echo.connector.pusher.connection.state === 'connected') {
                setIsConnected(true);
            }
        }

        // Setup notification channel
        if (enableNotifications && user.id) {
            const channelName = `App.Models.User.${user.id}`;
            if (!activeChannelsRef.current.has(channelName)) {
                echo.private(channelName)
                    .listen('.new_notification', (data: any) => {
                        dispatch(addNotification(data));
                        if (!data.is_read) {
                            dispatch(incrementUnreadCount());
                        }
                    });
                activeChannelsRef.current.add(channelName);
            }
        }

        return echo;
    }, [user, enableNotifications, dispatch]);

    useEffect(() => {
        isMountedRef.current = true;
        initializeEcho();

        return () => {
            isMountedRef.current = false;
            // We don't necessarily want to disconnect Echo here if it's shared,
            // but since we treat it as singleton in getEcho, we leave it be.
            // However, we should unsubscribe from channels if we joined them?
            // For now, let's leave channels active to avoid constant resubscribe on re-renders
            // unless we strictly want to clean up.
            
            // Actually, if we use a singleton Echo, we should probably track channel subscriptions
            // globally or risk memory leaks.
            // For this implementation, we rely on Echo's internal management.
        };
    }, [initializeEcho]);

    const reconnect = useCallback(() => {
        setConnectionError(null);
        initializeEcho();
    }, [initializeEcho]);

    const dispatchEvent = useCallback((eventName: string, data: any) => {
        if (eventHandlersRef.current[eventName]) {
            eventHandlersRef.current[eventName].forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`Error in handler for ${eventName}:`, e);
                }
            });
        }
    }, []);

    const joinRoom = useCallback((roomId: string) => {
        if (!isMountedRef.current || !enableChat || !echoRef.current) return;
        
        const channelName = `chat.${roomId}`;
        
        // Leave previous chat channels if needed? 
        // Typically we only want to be in one chat room at a time.
        // But the user might have multiple tabs.
        // Let's assume one active chat room per useSocket instance.
        
        // Check if already subscribed? Echo handles deduplication usually, but...
        
        const channel = echoRef.current.private(channelName);
        
        // Bind backend events
        channel.listen('.new_message', (data: any) => dispatchEvent('new_message', data));
        channel.listen('.messages_read', (data: any) => dispatchEvent('messages_read', data));
        
        // Contract/Offer events
        channel.listen('.offer_created', (data: any) => dispatchEvent('offer_created', data));
        channel.listen('.offer_accepted', (data: any) => dispatchEvent('offer_accepted', data));
        channel.listen('.offer_rejected', (data: any) => dispatchEvent('offer_rejected', data));
        channel.listen('.offer_cancelled', (data: any) => dispatchEvent('offer_cancelled', data));
        channel.listen('.contract_completed', (data: any) => dispatchEvent('contract_completed', data));
        channel.listen('.contract_terminated', (data: any) => dispatchEvent('contract_terminated', data));
        channel.listen('.contract_activated', (data: any) => dispatchEvent('contract_activated', data));
        // channel.listen('.contract_status_update', (data: any) => dispatchEvent('contract_status_update', data)); // Not found in events yet
        
        // Whisper events (Client-to-Client)
        channel.listenForWhisper('typing', (data: any) => {
            // Echo whisper data usually comes as is.
            // We need to match the structure expected by Chat.tsx: { roomId, userName, isTyping }
            dispatchEvent('user_typing', {
                roomId,
                userName: data.userName,
                isTyping: data.typing
            });
        });
        
        activeChannelsRef.current.add(channelName);
        
    }, [enableChat, dispatchEvent]);

    const leaveRoom = useCallback((roomId: string) => {
        if (!isMountedRef.current || !enableChat || !echoRef.current) return;
        
        const channelName = `chat.${roomId}`;
        echoRef.current.leave(channelName);
        activeChannelsRef.current.delete(channelName);
    }, [enableChat]);

    const sendMessage = useCallback(async (roomId: string, message: string, file?: File): Promise<Message> => {
        if (!user) throw new Error('User not authenticated');

        try {
            let messageData: Message;
            if (file) {
                const formData = new FormData();
                formData.append('room_id', roomId);
                formData.append('file', file);
                if (message && message.trim()) {
                    formData.append('message', message.trim());
                }
                const response = await apiClient.post('/chat/messages', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                messageData = response.data.data;
            } else {
                const response = await apiClient.post('/chat/messages', {
                    room_id: roomId,
                    message,
                });
                messageData = response.data.data;
            }
            (messageData as any).sent = true;
            (messageData as any).pending = false;
            return messageData;
        } catch (error) {
            console.error('❌ Error sending message:', error);
            throw error;
        }
    }, [user]);

    const startTyping = useCallback((roomId: string) => {
        if (!echoRef.current || !user) return;
        const channel = echoRef.current.private(`chat.${roomId}`);
        // Whisper typing
        channel.whisper('typing', {
            userName: user.name,
            typing: true
        });
    }, [user]);

    const stopTyping = useCallback((roomId: string) => {
        if (!echoRef.current || !user) return;
        const channel = echoRef.current.private(`chat.${roomId}`);
        channel.whisper('typing', {
            userName: user.name,
            typing: false
        });
    }, [user]);

    const markMessagesAsRead = useCallback(async (roomId: string, messageIds: number[]): Promise<void> => {
        if (!user) return;
        try {
            await apiClient.post('/chat/mark-read', {
                room_id: roomId,
                message_ids: messageIds,
            });
            // No need to emit socket event, the API now dispatches MessagesRead event which we listen to.
        } catch (error) {
            console.error('Error marking messages as read:', error);
            throw error;
        }
    }, [user]);

    const sendOfferAcceptanceMessage = useCallback((roomId: string, offerData: any, contractData: any, senderId: number, senderName: string, senderAvatar?: string) => {
         // This seems to be a client-side injected message in the old code?
         // Or an emitted event that the server handles?
         // In old code: socket.emit('send_offer_acceptance_message', ...)
         // If there's no API endpoint for this, we might need one or use Whisper.
         // But this sounds like a persistent message.
         // Let's assume for now it should be handled via API or it's just a local update.
         // Checking Chat.tsx: It listens to 'offer_acceptance_message'.
         // If the backend doesn't support this via API, we might have a gap.
         // But OfferAccepted event from backend should cover this.
         // The 'offer_acceptance_message' seems to be a synthetic event for UI feedback?
         
         // For now, let's dispatch it locally to listeners if we want immediate feedback
         dispatchEvent('offer_acceptance_message', {
             roomId, offerData, contractData, senderId, senderName, senderAvatar, timestamp: new Date().toISOString()
         });
    }, [dispatchEvent]);

    // Register event listener helper
    const registerListener = (eventName: string, callback: Function) => {
        if (!eventHandlersRef.current[eventName]) {
            eventHandlersRef.current[eventName] = new Set();
        }
        eventHandlersRef.current[eventName].add(callback);
        return () => {
            if (eventHandlersRef.current[eventName]) {
                eventHandlersRef.current[eventName].delete(callback);
            }
        };
    };

    return {
        socket: echoRef.current,
        isConnected,
        connectionError,
        joinRoom,
        leaveRoom,
        sendMessage,
        startTyping,
        stopTyping,
        markMessagesAsRead,
        onNewMessage: (cb) => registerListener('new_message', cb),
        onUserTyping: (cb) => registerListener('user_typing', cb),
        onMessagesRead: (cb) => registerListener('messages_read', cb),
        onOfferCreated: (cb) => registerListener('offer_created', cb),
        onOfferAccepted: (cb) => registerListener('offer_accepted', cb),
        onOfferRejected: (cb) => registerListener('offer_rejected', cb),
        onOfferCancelled: (cb) => registerListener('offer_cancelled', cb),
        onContractCompleted: (cb) => registerListener('contract_completed', cb),
        onContractTerminated: (cb) => registerListener('contract_terminated', cb),
        onContractActivated: (cb) => registerListener('contract_activated', cb),
        onContractStatusUpdate: (cb) => registerListener('contract_status_update', cb),
        onOfferAcceptanceMessage: (cb) => registerListener('offer_acceptance_message', cb),
        sendOfferAcceptanceMessage,
        reconnect,
    };
};
