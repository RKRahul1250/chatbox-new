import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import forge from "node-forge";
import {
  UserIcon,
  UsersIcon,
  PhoneIcon,
  BellIcon,
  PaperClipIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import GroupManagement from "./GroupManagement";
import CallHandler from "./CallHandler";
import Settings from "./Settings";

// ---- Utility Functions ----
const safeRender = (value, fallback = "Unknown") => {
  // Prevents null/undefined errors by providing a fallback for rendering values
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.name) return value.name;
  return JSON.stringify(value);
};

// ---- Main Component ----
const Message = ({ token, privateKey }) => {
  // ---- State Declarations ----
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatType, setChatType] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [lastMessageTimes, setLastMessageTimes] = useState([]);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [tempNotifications, setTempNotifications] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showOnlyGroups, setShowOnlyGroups] = useState(false);
  const [showOnlyContacts, setShowOnlyContacts] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ---- Refs ----
  const socket = useRef(null);
  const fileInputRef = useRef(null);
  const notificationsRef = useRef(null);
  const notificationTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // ---- Scroll Utility ----
  const scrollToBottom = () => {
    // Ensures the message container scrolls to the latest message
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  };

  // ---- Decryption Logic ----
  const decryptMessage = (
    encryptedContent,
    plaintextContent,
    isPrivate,
    senderId,
    currentUserId
  ) => {
    // Handles decryption of private messages using RSA-OAEP
    if (!isPrivate || senderId === currentUserId)
      return safeRender(plaintextContent);
    if (!privateKey || !encryptedContent)
      return safeRender(encryptedContent || plaintextContent);
    try {
      const privateKeyObj = forge.pki.privateKeyFromPem(privateKey);
      const encryptedBytes = forge.util.decode64(encryptedContent);
      const decrypted = privateKeyObj.decrypt(encryptedBytes, "RSA-OAEP");
      return forge.util.decodeUtf8(decrypted);
    } catch (error) {
      console.error("Decryption error:", error.message);
      return "[Decryption Failed]";
    }
  };

  // ---- Permission Checks ----
  const canSendInGroup = (groupId) => {
    // Determines if the user has permission to send messages in a group
    const group = groups.find((g) => g._id === groupId);
    if (!group) return false;
    const creatorId = safeRender(group.creator?._id || group.creator);
    if (creatorId === currentUserId) return true;
    const member = group.members.find(
      (m) => safeRender(m.userId?._id || m.userId) === currentUserId
    );
    return member?.canSendMessages === true;
  };

  const canCallInGroup = (groupId) => {
    // Checks if the user can start a call in a group
    const group = groups.find((g) => g._id === groupId);
    if (!group) return false;
    const creatorId = safeRender(group.creator?._id || group.creator);
    if (creatorId === currentUserId) return true;
    const member = group.members.find(
      (m) => safeRender(m.userId?._id || m.userId) === currentUserId
    );
    return member?.canCall === true;
  };

  // ---- Notification Utilities ----
  const showPermissionDeniedNotification = (action) => {
    // Adds a permission-denied notification to the list
    setNotifications((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: `Permission denied: You cannot ${action}`,
        read: false,
        timestamp: new Date(),
      },
    ]);
  };

  // ---- User Profile Management ----
  const showUserProfile = async (userId) => {
    // Fetches and displays a user's profile
    try {
      const response = await axios.get(
        `https://chatbox-einfra.onrender.com/api/users/${userId}`,
        {
          headers: { Authorization: token },
        }
      );
      setSelectedUser(response.data);
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const closeProfile = () => setSelectedUser(null);

  // ---- Group Admin Check ----
  const isGroupAdmin = (groupId) => {
    // Verifies if the current user is the admin of a group
    const group = groups.find((g) => g._id === groupId);
    return (
      group && safeRender(group.creator?._id || group.creator) === currentUserId
    );
  };

  // ---- Call Handling ----
  const startGroupCall = () => {
    // Initiates a group call if the user has permission
    if (!socket.current || !selectedChat || chatType !== "group") return;
    if (!canCallInGroup(selectedChat)) {
      showPermissionDeniedNotification("start calls in this group");
      return;
    }
    console.log("Starting group call for:", selectedChat);
    socket.current.emit("startGroupCall", { groupId: selectedChat });
  };

  // ---- Settings Toggle ----
  const toggleSettings = () => setShowSettings((prev) => !prev);

  // ---- Click Outside Detection for Notifications ----
  useEffect(() => {
    // Closes the notification panel when clicking outside
    const handleClickOutside = (event) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---- Socket Initialization and Event Listeners ----
  useEffect(() => {
    // Sets up Socket.io connection and handles real-time events
    if (!token || socket.current) return;

    socket.current = io("https://chatbox-einfra.onrender.com", {
      auth: { token },
      forceNew: true,
    });

    socket.current.on("connect", () =>
      console.log("Connected:", socket.current.id)
    );

    socket.current.on("userId", (userId) => {
      setCurrentUserId(userId);
      socket.current.userId = userId;
      console.log("Current user ID set:", userId);
    });

    socket.current.on("chatMessage", (msg) => {
      const isPrivate = !!msg.recipient;
      const content = msg.file
        ? { type: "file", ...msg.file }
        : decryptMessage(
            msg.encryptedContent,
            msg.content,
            isPrivate,
            safeRender(msg.sender?._id || msg.sender),
            socket.current.userId
          );

      setMessages((prev) => {
        const filtered = prev.filter(
          (m) => m.tempId !== msg.tempId && m._id !== msg._id
        );
        return [...filtered, { ...msg, content }];
      });

      const chatId = isPrivate
        ? msg.sender._id === currentUserId
          ? msg.recipient
          : msg.sender._id
        : msg.group;

      if (chatId) {
        setLastMessageTimes((prev) => {
          const withoutCurrent = prev.filter((lm) => lm.userId !== chatId);
          return [
            {
              userId: chatId,
              lastMessageTime: new Date().toISOString(),
              lastMessage: content.type === "file" ? "Sent a file" : content,
            },
            ...withoutCurrent,
          ];
        });

        if (isPrivate) {
          setUsers((prev) => {
            const user = prev.find((u) => u._id === chatId);
            if (!user) return prev;
            const remaining = prev.filter((u) => u._id !== chatId);
            return [user, ...remaining];
          });
        } else {
          setGroups((prev) => {
            const group = prev.find((g) => g._id === chatId);
            if (!group) return prev;
            const remaining = prev.filter((g) => g._id !== chatId);
            return [group, ...remaining];
          });
        }
      }

      if (safeRender(msg.sender?._id || msg.sender) !== currentUserId) {
        const senderName = safeRender(msg.sender?.name, "Someone");
        const notificationText = msg.file
          ? `${senderName} sent a file`
          : `${senderName}: ${content}`;
        const notificationId = Date.now();

        setTempNotifications((prev) => [
          ...prev,
          { id: notificationId, text: notificationText },
        ]);
        setTimeout(() => {
          setTempNotifications((prev) =>
            prev.filter((n) => n.id !== notificationId)
          );
        }, 2000);
      }
    });

    socket.current.on("error", (error) =>
      console.error("Socket error:", error.message)
    );

    Promise.all([
      axios.get("https://chatbox-einfra.onrender.com/api/users", {
        headers: { Authorization: token },
      }),
      axios.get("https://chatbox-einfra.onrender.com/api/groups", {
        headers: { Authorization: token },
      }),
      axios.get("https://chatbox-einfra.onrender.com/api/messages/last-messages", {
        headers: { Authorization: token },
      }),
    ])
      .then(([usersRes, groupsRes, lastMessagesRes]) => {
        setUsers(usersRes.data);
        setGroups(groupsRes.data);
        const formattedTimes = lastMessagesRes.data.map((msg) => ({
          userId: msg.userId.toString(),
          lastMessageTime: msg.lastMessageTime,
        }));
        setLastMessageTimes(formattedTimes);

        if (socket.current && socket.current.userId) {
          groupsRes.data.forEach((group) => {
            socket.current.emit("joinGroup", group._id);
            console.log(
              `User ${socket.current.userId} joined group ${group._id}`
            );
          });
        }
      })
      .catch((err) => console.error("Error fetching initial data:", err));

    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current = null;
      }
    };
  }, [token, privateKey]);

  // ---- Fetch Messages for Selected Chat ----
  useEffect(() => {
    // Loads messages when a chat is selected
    if (token && selectedChat && currentUserId) {
      const fetchMessages = async () => {
        try {
          const url =
            chatType === "user"
              ? `https://chatbox-einfra.onrender.com/api/messages/private/${selectedChat}`
              : `https://chatbox-einfra.onrender.com/api/messages/group/${selectedChat}`;
          const res = await axios.get(url, {
            headers: { Authorization: token },
          });
          const processedMessages = res.data.map((msg) => ({
            ...msg,
            content: msg.file
              ? { type: "file", ...msg.file }
              : decryptMessage(
                  msg.encryptedContent,
                  msg.content,
                  !!msg.recipient,
                  safeRender(msg.sender?._id || msg.sender),
                  currentUserId
                ),
          }));
          setMessages(processedMessages);
          setTimeout(() => {
            scrollToBottom();
          }, 100);
        } catch (error) {
          console.error("Error fetching messages:", error);
        }
      };
      fetchMessages();
    }
  }, [selectedChat, chatType, token, privateKey, currentUserId]);

  // ---- Auto-Scroll on New Messages ----
  useEffect(() => {
    // Automatically scrolls to the bottom when messages update
    scrollToBottom();
  }, [messages]);

  // ---- File Handling ----
  const handleFileChange = (event) => {
    // Updates state when a file is selected for upload
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setMessage(`Uploading: ${file.name}`);
    }
  };

  // ---- Send Message Logic ----
  const sendMessage = async () => {
    // Sends a message or file to the selected chat
    if (!socket.current || (!message.trim() && !selectedFile)) return;

    if (chatType === "group" && !canSendInGroup(selectedChat)) {
      showPermissionDeniedNotification("send messages in this group");
      return;
    }

    const tempId = Date.now().toString();
    let newMessage;

    if (selectedFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (chatType === "user") formData.append("recipient", selectedChat);
      if (chatType === "group") formData.append("group", selectedChat);
      formData.append("tempId", tempId);

      try {
        const response = await axios.post(
          "https://chatbox-einfra.onrender.com/api/upload",
          formData,
          {
            headers: {
              Authorization: token,
              "Content-Type": "multipart/form-data",
            },
          }
        );
        newMessage = {
          sender: { _id: currentUserId, name: "You" },
          content: { type: "file", ...response.data },
          recipient: chatType === "user" ? selectedChat : null,
          group: chatType === "group" ? selectedChat : null,
          tempId,
          timestamp: new Date(),
        };
        socket.current.emit("chatMessage", {
          recipient: chatType === "user" ? selectedChat : null,
          group: chatType === "group" ? selectedChat : null,
          file: response.data,
          tempId,
        });
      } catch (error) {
        console.error("File upload failed:", error);
        return;
      }
    } else {
      newMessage = {
        sender: { _id: currentUserId, name: "You" },
        content: message,
        recipient: chatType === "user" ? selectedChat : null,
        group: chatType === "group" ? selectedChat : null,
        tempId,
        timestamp: new Date(),
      };
      socket.current.emit("chatMessage", {
        recipient: chatType === "user" ? selectedChat : null,
        group: chatType === "group" ? selectedChat : null,
        content: message,
        tempId,
      });
    }

    setMessages((prev) => [...prev, newMessage]);
    setMessage("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---- Notification Management ----
  const markNotificationAsRead = (id) => {
    // Marks a notification as read
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const clearAllNotifications = () => {
    // Clears all notifications and hides the panel
    setNotifications([]);
    setShowNotifications(false);
  };

  // ---- Message Rendering ----
  const renderMessageContent = (msg) => {
    // Renders message content, handling files and text differently
    if (!msg || !msg.content) return <div>[Invalid Message]</div>;
    if (msg.content.type === "file") {
      const { name, url, size, mimeType } = msg.content;
      const isImage = mimeType?.startsWith("image/");
      return (
        <div className="flex flex-col">
          {isImage ? (
            <img src={url} alt={name} className="max-w-[200px] rounded-lg" />
          ) : (
            <a
              href={url}
              download={name}
              className="text-blue-500 hover:underline cursor-pointer"
            >
              📎 {name} ({(size / 1024).toFixed(2)} KB)
            </a>
          )}
        </div>
      );
    }
    return <p>{safeRender(msg.content)}</p>;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ---- JSX Rendering ----
  return (
    <div className="h-screen bg-gray-50 flex flex-col md:flex-row overflow-hidden fixed inset-0">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-3/4 sm:w-1/2 md:w-1/4 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 sm:p-6 bg-gradient-to-r from-blue-400 to-blue-600 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Chats</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleSettings}
              className="text-white hover:text-gray-200 focus:outline-none cursor-pointer"
              title="Settings"
            >
              <AdjustmentsHorizontalIcon className="h-6 w-6" />
            </button>
            <button
              className="text-white md:hidden cursor-pointer"
              onClick={() => setIsSidebarOpen(false)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-row space-x-4 sm:space-x-12 overflow-x-auto bg-white border-b border-gray-200 px-4 py-2">
          <button
            className="flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600 cursor-pointer"
            onClick={() => {
              setShowOnlyGroups(false);
              setShowOnlyContacts(false);
            }}
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-xs">All</span>
          </button>
          <button
            className="flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600 cursor-pointer"
            onClick={() => {
              setShowOnlyGroups(true);
              setShowOnlyContacts(false);
            }}
          >
            <UsersIcon className="w-5 h-5" />
            <span className="text-xs">Groups</span>
          </button>
          <button
            className="flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600 cursor-pointer"
            onClick={() => {
              setShowOnlyContacts(true);
              setShowOnlyGroups(false);
            }}
          >
            <PhoneIcon className="w-5 h-5" />
            <span className="text-xs">Contacts</span>
          </button>
          <button
            className="relative flex flex-col items-center text-gray-700 font-semibold hover:text-blue-600 cursor-pointer"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
            <span className="text-xs">Notifications</span>
          </button>
        </div>
        <GroupManagement
          token={token}
          users={users}
          groups={groups}
          setGroups={setGroups}
          setSelectedChat={setSelectedChat}
          setChatType={setChatType}
          currentUserId={currentUserId}
          showUserProfile={showUserProfile}
          showOnlyGroups={showOnlyGroups}
          setShowOnlyGroups={setShowOnlyGroups}
          showOnlyContacts={showOnlyContacts}
          setShowOnlyContacts={setShowOnlyContacts}
          lastMessageTimes={lastMessageTimes}
          socket={socket}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-gray-50 relative">
      <div className="p-4 sm:p-6 bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-between shadow-lg">
          <div className="flex items-center">
            <button
              className="text-white mr-4 md:hidden cursor-pointer"
              onClick={() => setIsSidebarOpen(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                {selectedChat
                  ? chatType === "user"
                    ? safeRender(
                        users.find((u) => u._id === selectedChat)?.name
                      )
                    : safeRender(
                        groups.find((g) => g._id === selectedChat)?.name
                      )
                  : "Select a Chat"}
              </h1>
            </div>
          </div>
          {selectedChat && (
            <div className="flex items-center space-x-4">
              {chatType === "group" && (
                <button
                  onClick={startGroupCall}
                  className={`text-white hover:text-gray-200 cursor-pointer ${
                    !canCallInGroup(selectedChat)
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  disabled={!canCallInGroup(selectedChat)}
                  title={
                    !canCallInGroup(selectedChat)
                      ? "You don't have permission to call"
                      : "Start group call"
                  }
                >
                  <PhoneIcon className="h-6 w-6" />
                </button>
              )}
            </div>
          )}
        </div>

        <div
          ref={messagesContainerRef}
          className="p-4 sm:p-6 overflow-y-auto h-[calc(100vh-192px)] sm:h-[calc(100vh-208px)]"
        >
          {selectedChat ? (
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-gray-200 px-4 py-2 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600">
                    {chatType === "user"
                      ? `${safeRender(
                          users.find((u) => u._id === selectedChat)?.name
                        )} joined the chat`
                      : `Group "${safeRender(
                          groups.find((g) => g._id === selectedChat)?.name
                        )}" created`}
                  </p>
                </div>
              </div>
              {messages
                .filter((msg) =>
                  chatType === "user"
                    ? (msg.recipient === selectedChat &&
                        msg.sender._id === currentUserId) ||
                      (msg.recipient === currentUserId &&
                        msg.sender._id === selectedChat)
                    : msg.group === selectedChat
                )
                .map((msg, index) => {
                  const senderName = safeRender(
                    users.find(
                      (u) => u._id === safeRender(msg.sender?._id || msg.sender)
                    )?.name,
                    "Unknown"
                  );
                  const receiverName =
                    chatType === "user"
                      ? safeRender(
                          users.find(
                            (u) =>
                              u._id ===
                              (msg.recipient === currentUserId
                                ? selectedChat
                                : msg.recipient)
                          )?.name,
                          "Unknown"
                        )
                      : safeRender(
                          groups.find((g) => g._id === selectedChat)?.name,
                          "Group"
                        );

                  return (
                    <div
                      key={msg._id || msg.tempId || `msg-${index}`}
                      className={`flex mb-4 ${
                        msg.sender._id === currentUserId
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`flex flex-col ${
                          msg.sender._id === currentUserId
                            ? "items-end"
                            : "items-start"
                        } max-w-[80%] sm:max-w-[60%]`}
                      >
                        <div
                          className={`text-xs mb-1 ${
                            msg.sender._id === currentUserId
                              ? "text-gray-600"
                              : "text-gray-500"
                          }`}
                        >
                          {chatType === "user" ? (
                            <>
                              <span>{senderName}</span> →{" "}
                              <span>{receiverName}</span>
                            </>
                          ) : (
                            <span>{senderName}</span>
                          )}
                        </div>
                        <div
                          className={`p-3 rounded-lg shadow ${
                            msg.sender._id === currentUserId
                              ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white"
                              : "bg-white text-gray-800"
                          }`}
                        >
                          {renderMessageContent(msg)}
                          <p
                            className={`text-xs mt-1 ${
                              msg.sender._id === currentUserId
                                ? "text-white opacity-80"
                                : "text-gray-500"
                            }`}
                          >
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm sm:text-base">
              Select a chat to start messaging
            </div>
          )}
        </div>
        {selectedChat && (
          <div className="p-4 bg-white border-t mt-12 border-gray-200 fixed bottom-0 left-0 right-0 md:static">
            <div className="flex flex-row items-center space-x-2">
              <div className="relative">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={
                    chatType === "group" && !canSendInGroup(selectedChat)
                  }
                />
                <label
                  className={`flex items-center justify-center p-2 rounded-lg border border-gray-300 cursor-pointer ${
                    chatType === "group" && !canSendInGroup(selectedChat)
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-gray-100"
                  }`}
                >
                  <PaperClipIcon className="h-5 w-5 text-gray-500" />
                </label>
              </div>
              <input
                type="text"
                placeholder="Type a message or select a file..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                disabled={
                  selectedFile !== null ||
                  (chatType === "group" && !canSendInGroup(selectedChat))
                }
              />

              {/* send button */}

              <button
                onClick={sendMessage}
                className={`w-10 sm:w-12 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-1.5 rounded-lg hover:from-blue-600 hover:to-blue-700 flex justify-center items-center cursor-pointer ${
                  chatType === "group" && !canSendInGroup(selectedChat)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                disabled={chatType === "group" && !canSendInGroup(selectedChat)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 sm:h-5 sm:w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Call Handler Component */}
      <CallHandler
        socket={socket}
        token={token}
        users={users}
        groups={groups}
        selectedChat={selectedChat}
        setSelectedChat={setSelectedChat}
        chatType={chatType}
        setChatType={setChatType}
        setNotifications={setNotifications}
      />

      {/* Notification Panel */}
      {showNotifications && (
        <div
          ref={notificationsRef}
          className="absolute top-16 right-2 sm:right-4 w-64 sm:w-80 bg-white rounded-lg shadow-lg z-50 max-h-80 sm:max-h-96 overflow-hidden animate-notification-popup"
        >
          <div className="bg-blue-500 h-1" />
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-base sm:text-lg font-semibold">
              Notifications
            </h3>
            <button
              onClick={clearAllNotifications}
              className="text-xs sm:text-sm text-red-500 hover:text-red-700 cursor-pointer"
            >
              Clear All
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">No notifications</p>
          ) : (
            notifications
              .slice()
              .reverse()
              .map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 sm:p-4 border-b border-gray-200 flex justify-between items-center ${
                    notification.read ? "bg-gray-100" : "bg-white"
                  }`}
                >
                  <div>
                    <p
                      className={
                        notification.read
                          ? "text-gray-600 text-sm"
                          : "text-gray-800 font-medium text-sm sm:text-base"
                      }
                    >
                      {notification.text}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  {!notification.read && (
                    <button
                      onClick={() => markNotificationAsRead(notification.id)}
                      className="text-blue-500 hover:text-blue-700 text-xs sm:text-sm cursor-pointer"
                    >
                      Mark as Read
                    </button>
                  )}
                </div>
              ))
          )}
        </div>
      )}

      {/* Temporary Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {tempNotifications.map((notification) => (
          <div
            key={notification.id}
            className="bg-white rounded-lg shadow-lg overflow-hidden animate-notification-slide animate-float"
          >
            <div className="bg-blue-500 h-1 animate-glow" />
            <div className="p-4 flex items-start space-x-3 backdrop-blur-sm bg-white/90">
              <div className="text-blue-500 animate-float">
                <BellIcon className="h-5 w-5" />
              </div>
              <p className="text-sm text-gray-700">{notification.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* User Profile Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-gray-50 bg-opacity-10 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg w-full max-w-sm">
            <h3 className="text-lg sm:text-xl font-bold mb-4">User Profile</h3>
            {selectedUser.image && (
              <img
                src={`https://chatbox-einfra.onrender.com/uploads/${selectedUser.image}`}
                alt={`${safeRender(selectedUser.name)}'s profile`}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full mb-4 object-cover mx-auto"
              />
            )}
            <p className="text-sm sm:text-base">
              <strong>Name:</strong> {safeRender(selectedUser.name)}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Email:</strong> {safeRender(selectedUser.email)}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Location:</strong>{" "}
              {safeRender(selectedUser.location, "Not specified")}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Designation:</strong>{" "}
              {safeRender(selectedUser.designation, "Not specified")}
            </p>
            <p className="text-sm sm:text-base">
              <strong>Status:</strong> {safeRender(selectedUser.status)}
            </p>
            <button
              onClick={closeProfile}
              className="mt-4 w-full bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 text-sm sm:text-base cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <Settings
          token={token}
          isOpen={showSettings}
          onClose={toggleSettings}
        />
      )}
    </div>
  );
};

export default Message;