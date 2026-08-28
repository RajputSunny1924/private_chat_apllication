import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://192.168.0.102:8000";

function App() {
  // ==============================
  // AUTH STATE
  // ==============================

  const [showRegister, setShowRegister] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [username, setUsername] = useState("");

  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");

  const [userId, setUserId] = useState("");
  const [connected, setConnected] = useState(false);

  // ==============================
  // CHAT STATE
  // ==============================

  const [receiverId, setReceiverId] = useState("");
  const receiverIdRef = useRef("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);

  const websocket = useRef(null);
  const messagesEndRef = useRef(null);
  // ==============================
  // LOGIN
  // ==============================

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

      console.log("LOGIN RESPONSE:", data);

      if (!response.ok) {
        setLoginError(data.detail || "Login failed");
        return;
      }

      console.log("LOGIN RESPONSE OK");

      localStorage.setItem("access_token", data.access_token);

      setUserId(String(data.user_id));

      setUsername(data.username);

      console.log("BEFORE CONNECTED");

      setConnected(true);

      console.log("AFTER CONNECTED");
    } catch (error) {
      console.error("LOGIN ERROR:", error);

      setLoginError("Login error: " + error.message);
    }
  };

  // ==============================
  // REGISTER
  // ==============================

  const register = async () => {
    setRegisterError("");

    if (!username || !email || !password) {
      setRegisterError("Please fill all fields");

      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("username", username);
      params.append("email", email);
      params.append("password", password);

      const response = await fetch(`${API_URL}/register?${params.toString()}`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setRegisterError(data.detail || "Registration failed");

        return;
      }

      alert("Registration successful! Now login.");

      // Go back to login
      setShowRegister(false);

      setPassword("");
    } catch (error) {
      console.error(error);

      setRegisterError("Cannot connect to server");
    }
  };

  // ==============================
  // WEBSOCKET CONNECTION
  // ==============================
  useEffect(() => {
    if (!connected) {
      return;
    }

    const loadUsers = async () => {
      try {
        const response = await fetch(`${API_URL}/users`);

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        setUsers(data);
      } catch (error) {
        console.log("Could not load users", error);
      }
    };

    loadUsers();
  }, [connected]);
  useEffect(() => {
    if (!connected || !userId) {
      return;
    }

    const ws = new WebSocket(`ws://192.168.0.102:8000/ws/${userId}`);

    websocket.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected as User", userId);
    };

    // ==============================
    // RECEIVE MESSAGE
    // ==============================

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log("Server:", data);

        if (data.type === "presence") {
          const refreshUsers = async () => {
            try {
              const response = await fetch(`${API_URL}/users`);

              if (!response.ok) {
                return;
              }

              const data = await response.json();

              setUsers(data);
            } catch (error) {
              console.log("Could not refresh users", error);
            }
          };

          refreshUsers();

          return;
        }

        if (data.type === "status") {
          setMessages((oldMessages) => {
            const messageExists = oldMessages.some(
              (msg) => String(msg.id) === String(data.message_id),
            );

            // Message abhi list me nahi hai
            if (!messageExists && data.status === "sent") {
              return [
                ...oldMessages,
                {
                  id: data.message_id,
                  text: data.message,
                  sender: "me",
                  userId: userId,
                  status: "sent",
                },
              ];
            }

            // Existing message ka status update karo
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

        // ==========================================
        // RECEIVED MESSAGE
        // ==========================================

        if (data.type === "message") {
          console.log("MESSAGE RECEIVED");
          console.log("Sender ID:", data.sender_id);
          console.log("Current Receiver ID:", receiverIdRef.current);
          const senderId = String(data.sender_id);

          setMessages((oldMessages) => {
            // Duplicate message already exists?
            const exists = oldMessages.some(
              (msg) => String(msg.id) === String(data.message_id),
            );

            if (exists) {
              return oldMessages;
            }

            // Only show message in currently opened chat
            if (senderId !== String(receiverIdRef.current)) {
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
              },
            ];
          });

          // If this user's chat is currently open,
          // immediately mark the message as seen.
          if (
            senderId === String(receiverIdRef.current) &&
            websocket.current &&
            websocket.current.readyState === WebSocket.OPEN
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

        // ==========================================
        // ERROR
        // ==========================================

        if (data.status === "error") {
          alert(data.message || "Message could not be sent");
        }
      } catch (error) {
        console.log("Invalid server response", error);
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

  // ==============================
  // SELECT USER
  // ==============================

  const selectUser = async (id) => {
    if (String(id) === String(userId)) {
      return;
    }

    setReceiverId(String(id));
    receiverIdRef.current = String(id);
    setMessages([]);

    // Load previous chat messages
    try {
      const response = await fetch(`${API_URL}/messages/${userId}/${id}`);

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      const formattedMessages = data.map((msg) => ({
        id: msg.id,

        text: msg.message,

        sender: String(msg.sender_id) === String(userId) ? "me" : "other",

        userId: msg.sender_id,

        status: msg.status || "sent",
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
        unseenMessageIds.length > 0 &&
        websocket.current &&
        websocket.current.readyState === WebSocket.OPEN
      ) {
        websocket.current.send(
          JSON.stringify({
            type: "seen",
            message_ids: unseenMessageIds,
          }),
        );
      }
    } catch (error) {
      console.log("Could not load chat history", error);
    }
  };

  // ==============================
  // SEND MESSAGE
  // ==============================

  const sendMessage = () => {
    if (!receiverId) {
      alert("Please select a user");
      return;
    }

    if (!message.trim()) {
      return;
    }

    if (!websocket.current || websocket.current.readyState !== WebSocket.OPEN) {
      alert("Not connected to chat server");
      return;
    }

    const messageText = message.trim();

    websocket.current.send(
      JSON.stringify({
        receiver_id: Number(receiverId),
        message: messageText,
      }),
    );

    setMessage("");
  };

  // ==============================
  // ENTER KEY
  // ==============================

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);
  // ==============================
  // LOGOUT
  // ==============================

  const logout = () => {
    if (websocket.current) {
      websocket.current.close();
    }
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
            /* ========================= */
            /* REGISTER */
            /* ========================= */

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

  // ==============================
  // CHAT UI
  // ==============================

  return (
    <div className="app">
      <div className={`chat-app ${receiverId ? "chat-open" : "users-open"}`}>
        {/* LEFT SIDE */}

        <div className="users">
          <h2>Private Chat</h2>

          <p className="my-user">
            {username} (User {userId})
          </p>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>

          {users.map((user) => (
            <div
              key={user.id}
              className={`user ${
                receiverId === String(user.id) ? "selected" : ""
              }`}
              onClick={() => selectUser(user.id)}>
              <div>
                {user.username} (User {user.id})
              </div>

              <div className={user.online ? "online" : "offline"}>
                {user.online ? "🟢 Online" : "⚫ Offline"}
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT SIDE */}

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
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.sender}`}>
                    {msg.text}

                    {msg.sender === "me" && (
                      <span
                        className={`message-status ${msg.status || "sent"}`}>
                        {msg.status === "sent" && "✓"}
                        {msg.status === "delivered" && "✓✓"}
                        {msg.status === "seen" && "✓✓"}
                      </span>
                    )}
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>

              <div className="message-box">
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
