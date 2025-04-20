import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  // Get friends list
  getFriends: async () => {
    set({ isUsersLoading: true });
    try {
      const response = await fetch("/api/users/friends", {
        credentials: "include",
      });
      const friends = await response.json();
      set({ users: friends });
    } catch (err) {
      console.error("Failed to load friends", err);
      set({ users: [] });
    } finally {
      set({ isUsersLoading: false });
    }
  },

  // Get chat messages with selected user
  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load messages.");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  // Send message + emit via socket
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const socket = useAuthStore.getState().socket;
    const currentUser = useAuthStore.getState().user;

    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);

      // Update local state
      set({ messages: [...messages, res.data] });

      // Emit socket message to receiver
      if (socket && currentUser && selectedUser) {
        socket.emit("sendMessage", {
          senderId: currentUser._id,
          receiverId: selectedUser._id,
          message: res.data,
        });
      }
    } catch (error) {
      console.error("Error in sending message", error);
      const errMsg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error.message ||
        "Failed to send message.";
      toast.error(errMsg);
    }
  },

  // Listen for new messages in real-time
  subscribeToMessages: () => {
    const { selectedUser } = get();
    const socket = useAuthStore.getState().socket;
    const currentUser = useAuthStore.getState().user;

    if (!socket || !currentUser || !selectedUser) {
      console.log("Socket, user, or selected user missing");
      return;
    }

    socket.on("newMessage", (newMessage) => {
      console.log("New message received:", newMessage);

      const isFromSelectedUser = selectedUser?._id === newMessage.senderId;
      const isFromSelf = newMessage.senderId === currentUser._id;

      if (!isFromSelf && !isFromSelectedUser) {
        toast(`${newMessage.senderName || "Someone"} sent you a message 💬`);
      }

      if (isFromSelectedUser) {
        set((state) => ({
          messages: [...state.messages, newMessage],
        }));
      }
    });
  },

  // Unsubscribe from socket
  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket?.off("newMessage");
  },

  // Set the selected user and resubscribe
  setSelectedUser: (selectedUser) => {
    console.log("Setting selected user:", selectedUser); // Debugging
    set({ selectedUser });
 
    const trySubscribe = () => {
      const socket = useAuthStore.getState().socket;
      const user = useAuthStore.getState().user;
  
      if (selectedUser && socket && user) {
        get().subscribeToMessages();
      } else {
        console.log("Retrying subscribe in 200ms...");
        setTimeout(trySubscribe, 200);
      }
    };
  
    trySubscribe();
  },
  
}));
