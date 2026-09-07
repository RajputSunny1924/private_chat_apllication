import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "https://private-chat-apllication-1.onrender.com";

function App() {
  // Auth
  const [showRegister, setShowRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [userId, setUserId] = useState("");
  const [connected, setConnected] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true",
  );
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(null);

  // Chat
  const [receiverId, setReceiverId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});

  const receiverIdRef = useRef("");
  const websocket = useRef(null);
  const messagesEndRef = useRef(null);

  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // Select media file
  const handleMediaSelect = (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("Only images and videos are allowed");
      return;
    }

    setSelectedMedia(file);
  };

  // Login
  const login = async () => {
    setLoginError("");

    if (!email || !password) {
      setLoginError("Please enter email and password");
      return;
    }

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginError(data.detail || "Login failed");
        return;
      }

      localStorage.setItem("access_token", data.access_token);

      setUserId(String(data.user_id));
      setUsername(data.username);
      setConnected(true);
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Login error: " + error.message);
    }
  };

  // Register
  const register = async () => {
    setRegisterError("");

    if (!username || !email || !password) {
      setRegisterError("Please fill all fields");
      return;
    }

    try {
      const params = new URLSearchParams({
        username,
        email,
        password,
      });

      const response = await fetch(`${API_URL}/register?${params.toString()}`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setRegisterError(data.detail || "Registration failed");
        return;
      }

      alert("Registration successful! Now login.");

      setShowRegister(false);
      setPassword("");
    } catch (error) {
      console.error("Registration error:", error);
      setRegisterError("Cannot connect to server");
    }
  };

  // Restore previous login session
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem("access_token");

      if (!token) {
        setCheckingAuth(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem("access_token");
          setCheckingAuth(false);
          return;
        }

        const data = await response.json();

        setUserId(String(data.id));
        setUsername(data.username);
        setEmail(data.email);
        setConnected(true);
      } catch (error) {
        console.log("Could not restore login:", error);
      } finally {
        setCheckingAuth(false);
      }
    };

    restoreSession();
  }, []);

  // Load users after login
  useEffect(() => {
    if (!connected) return;

    const loadUsers = async () => {
      try {
        const response = await fetch(`${API_URL}/users`);

        if (!response.ok) return;

        const data = await response.json();
        setUsers(data);
      } catch (error) {
        console.log("Could not load users:", error);
      }
    };

    loadUsers();
  }, [connected]);

  // WebSocket connection
  useEffect(() => {
    if (!connected || !userId) return;

    const ws = new WebSocket(
      `wss://private-chat-apllication-1.onrender.com/ws/${userId}`,
    );

    websocket.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // User online/offline status changed
        if (data.type === "presence") {
          try {
            const response = await fetch(`${API_URL}/users`);

            if (response.ok) {
              const users = await response.json();
              setUsers(users);
            }
          } catch (error) {
            console.log("Could not refresh users:", error);
          }

          return;
        }

        // Message status update
        if (data.type === "status") {
          setMessages((oldMessages) => {
            const messageExists = oldMessages.some(
              (msg) => String(msg.id) === String(data.message_id),
            );

            if (data.status === "viewed") {
              return oldMessages.map((msg) =>
                String(msg.id) === String(data.message_id)
                  ? {
                      ...msg,
                      status: "viewed",
                      viewed: true,
                      isViewOnce: false,
                    }
                  : msg,
              );
            }

            if (!messageExists && data.status === "sent") {
              return [
                ...oldMessages,
                {
                  id: data.message_id,
                  text: data.message,
                  sender: "me",
                  userId,
                  status: "sent",
                  messageType: data.message_type || "text",
                  mediaType: data.media_type || null,
                  mediaUrl: data.media_url || null,
                  isViewOnce: data.is_view_once || false,
                },
              ];
            }

            return oldMessages.map((msg) =>
              String(msg.id) === String(data.message_id)
                ? {
                    ...msg,
                    status: data.status,
                  }
                : msg,
            );
          });

          return;
        }

        // New received message
        if (data.type === "message") {
          const senderId = String(data.sender_id);
          const currentReceiverId = String(receiverIdRef.current);

          if (senderId !== currentReceiverId) {
            setUnreadCounts((oldCounts) => ({
              ...oldCounts,
              [senderId]: (oldCounts[senderId] || 0) + 1,
            }));

            const sender = users.find((user) => String(user.id) === senderId);

            if (
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification(sender ? sender.username : `User ${senderId}`, {
                body: data.message || "New media message",
              });
            }
          }

          setMessages((oldMessages) => {
            const exists = oldMessages.some(
              (msg) => String(msg.id) === String(data.message_id),
            );

            if (exists || senderId !== String(receiverIdRef.current)) {
              return oldMessages;
            }

            return [
              ...oldMessages,
              {
                id: data.message_id,
                text: data.message,
                sender: "other",
                userId: data.sender_id,
                status: data.status || "delivered",
                messageType: data.message_type || "text",
                mediaType: data.media_type || null,
                mediaUrl: data.media_url || null,
                isViewOnce: data.is_view_once || false,
              },
            ];
          });

          // Mark message as seen when its chat is open
          if (
            senderId === String(receiverIdRef.current) &&
            websocket.current?.readyState === WebSocket.OPEN
          ) {
            websocket.current.send(
              JSON.stringify({
                type: "seen",
                message_ids: [data.message_id],
              }),
            );
          }

          return;
        }

        if (data.status === "error") {
          alert(data.message || "Message could not be sent");
        }
      } catch (error) {
        console.log("Invalid server response:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
    };

    ws.onerror = (error) => {
      console.log("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, [connected, userId]);

  // Select a user and load chat history
  const selectUser = async (id) => {
    if (String(id) === String(userId)) return;

    setReceiverId(String(id));
    receiverIdRef.current = String(id);

    setUnreadCounts((oldCounts) => ({
      ...oldCounts,
      [String(id)]: 0,
    }));

    setMessages([]);

    try {
      const response = await fetch(`${API_URL}/messages/${userId}/${id}`);

      if (!response.ok) return;

      const data = await response.json();

      const formattedMessages = data.map((msg) => ({
        id: msg.id,
        text: msg.message,
        sender: String(msg.sender_id) === String(userId) ? "me" : "other",
        userId: msg.sender_id,
        status: msg.status || "sent",
        messageType: msg.message_type || "text",
        mediaType: msg.media_type || null,
        mediaUrl: msg.media_url || null,
        isViewOnce: msg.is_view_once || false,
      }));

      setMessages(formattedMessages);

      const unseenMessageIds = data
        .filter(
          (msg) =>
            String(msg.sender_id) === String(id) &&
            String(msg.receiver_id) === String(userId) &&
            msg.status !== "seen",
        )
        .map((msg) => msg.id);

      if (
        unseenMessageIds.length &&
        websocket.current?.readyState === WebSocket.OPEN
      ) {
        websocket.current.send(
          JSON.stringify({
            type: "seen",
            message_ids: unseenMessageIds,
          }),
        );
      }
    } catch (error) {
      console.log("Could not load chat history:", error);
    }
  };

  // Send text or media message
  const sendMessage = async () => {
    if (!receiverId) {
      alert("Please select a user");
      return;
    }

    if (!message.trim() && !selectedMedia) return;

    if (websocket.current?.readyState !== WebSocket.OPEN) {
      alert("Not connected to chat server");
      return;
    }

    // Send View Once media
    if (selectedMedia) {
      try {
        const formData = new FormData();
        formData.append("file", selectedMedia);

        const token = localStorage.getItem("access_token");

        const response = await fetch(`${API_URL}/upload-media`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.detail || "Media upload failed");
          return;
        }

        websocket.current.send(
          JSON.stringify({
            type: "media",
            receiver_id: Number(receiverId),
            media_type: data.media_type.startsWith("image") ? "image" : "video",
            media_url: data.media_url,
          }),
        );

        setSelectedMedia(null);
        return;
      } catch (error) {
        console.error("Media upload error:", error);
        alert("Cannot upload media");
        return;
      }
    }

    // Send text message
    websocket.current.send(
      JSON.stringify({
        receiver_id: Number(receiverId),
        message: message.trim(),
      }),
    );

    setMessage("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  };

  // Ask for notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Update profile photo
  const handleProfilePhoto = async (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("access_token");

      const response = await fetch(`${API_URL}/profile/photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Profile photo upload failed");
        return;
      }

      setProfilePhoto(data.profile_photo);
      alert("Profile photo updated successfully!");
    } catch (error) {
      console.error("Profile photo error:", error);
      alert("Cannot connect to server");
    }
  };

  // Logout
  const logout = () => {
    websocket.current?.close();

    localStorage.removeItem("access_token");

    setConnected(false);
    setUserId("");
    setUsername("");
    setEmail("");
    setPassword("");
    setReceiverId("");
    setMessages([]);
  };
  // ==============================
  // LOGIN SCREEN
  // ==============================
  if (checkingAuth) {
    return <div className="app">Loading...</div>;
  }

  if (!connected) {
    return (
      <div className="app">
        <div className="login-box">
          <h1>Private Chat</h1>

          {!showRegister ? (
            <>
              <h2>Login</h2>

              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {loginError && <p className="error">{loginError}</p>}

              <button onClick={login}>Login</button>

              <p className="switch-text">
                Don't have an account?
                <span
                  onClick={() => {
                    setShowRegister(true);
                    setLoginError("");
                  }}>
                  Register
                </span>
              </p>
            </>
          ) : (
            <>
              <h2>Register</h2>

              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />

              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {registerError && <p className="error">{registerError}</p>}

              <button onClick={register}>Register</button>

              <p className="switch-text">
                Already have an account?
                <span
                  onClick={() => {
                    setShowRegister(false);
                    setRegisterError("");
                  }}>
                  Login
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? "dark-mode" : ""}`}>
      <div className={`chat-app ${receiverId ? "chat-open" : "users-open"}`}>
        <div className="users">
          <div className="users-header">
            <h1>Private Chat</h1>

            <div className="menu-container">
              <button
                className="menu-button"
                onClick={() => setShowMenu(!showMenu)}>
                ⋮
              </button>

              {showMenu && (
                <div className="dropdown-menu">
                  <label className="profile-photo-button">
                    🖼️ Profile Photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleProfilePhoto}
                      hidden
                    />
                  </label>

                  <button onClick={() => setDarkMode(!darkMode)}>
                    {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
                  </button>

                  <button onClick={logout}>🚪 Logout</button>
                </div>
              )}
            </div>
          </div>

          {users.map((user) => (
            <div
              key={user.id}
              className={`user ${
                receiverId === String(user.id) ? "selected" : ""
              }`}
              onClick={() => selectUser(user.id)}>
              <div className="user-avatar">
                {user.profile_photo ? (
                  <img src={`${API_URL}${user.profile_photo}`} alt="" />
                ) : (
                  "👤"
                )}
              </div>

              <div>
                {user.username}

                {unreadCounts[String(user.id)] > 0 && (
                  <span className="unread-badge">
                    {unreadCounts[String(user.id)]}
                  </span>
                )}
              </div>

              <div className={user.online ? "online" : "offline"}>
                {user.online ? "🟢 Online" : "⚫ Offline"}
              </div>
            </div>
          ))}
        </div>

        <div className="chat">
          {!receiverId ? (
            <div className="no-chat">
              <h2>Select a user</h2>
              <p>Choose a user from the left side.</p>
            </div>
          ) : (
            <>
              <div className="chat-header">
                <button
                  className="back-button"
                  onClick={() => {
                    setReceiverId("");
                    receiverIdRef.current = "";
                    setMessages([]);
                  }}>
                  ←
                </button>
                User {receiverId}
              </div>

              <div className="messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.sender}`}>
                    {msg.messageType === "media" ? (
                      <div
                        className="view-once-media"
                        style={{ cursor: "pointer" }}
                        onClick={async () => {
                          if (msg.viewed) return;

                          try {
                            const token = localStorage.getItem("access_token");

                            const response = await fetch(
                              `${API_URL}${msg.mediaUrl}`,
                              {
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                },
                              },
                            );

                            if (!response.ok) {
                              alert(
                                "This media has already been viewed or expired.",
                              );
                              return;
                            }

                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);

                            window.open(url, "_blank");

                            if (
                              websocket.current?.readyState === WebSocket.OPEN
                            ) {
                              websocket.current.send(
                                JSON.stringify({
                                  type: "viewed",
                                  message_id: msg.id,
                                }),
                              );
                            }

                            setMessages((oldMessages) =>
                              oldMessages.map((m) =>
                                m.id === msg.id
                                  ? {
                                      ...m,
                                      isViewOnce: false,
                                      viewed: true,
                                    }
                                  : m,
                              ),
                            );
                          } catch (error) {
                            console.error(error);
                            alert("Could not open media");
                          }
                        }}>
                        {msg.mediaType === "image" ? (
                          <div>📷 View Once Photo</div>
                        ) : (
                          <div>🎥 View Once Video</div>
                        )}
                      </div>
                    ) : (
                      msg.text
                    )}

                    {msg.sender === "me" && (
                      <span
                        className={`message-status ${msg.status || "sent"}`}>
                        {msg.status === "sent" && "✓"}
                        {msg.status === "delivered" && "✓✓"}
                        {msg.status === "seen" && "✓✓"}
                        {msg.status === "viewed" && "✓ Viewed"}
                      </span>
                    )}
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>

              {selectedMedia && (
                <div className="media-preview">
                  <span>📎 {selectedMedia.name}</span>

                  <button onClick={() => setSelectedMedia(null)}>❌</button>
                </div>
              )}

              <div className="message-box">
                <label className="media-button">
                  📎
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    onChange={handleMediaSelect}
                    hidden
                  />
                </label>

                <input
                  type="text"
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                />

                <button onClick={sendMessage}>Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
