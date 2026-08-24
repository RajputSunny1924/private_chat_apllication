import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

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
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  const websocket = useRef(null);

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

      if (!response.ok) {
        setLoginError(data.detail || "Login failed");

        return;
      }

      // Save JWT token
      localStorage.setItem("access_token", data.access_token);

      // Save user information
      setUserId(String(data.user_id));

      setUsername(data.username);

      setConnected(true);
    } catch (error) {
      console.error(error);

      setLoginError("Cannot connect to server");
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
    if (!connected || !userId) {
      return;
    }

    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${userId}`);

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

        // Message from another user
        if (
          data.sender_id !== undefined &&
          data.receiver_id !== undefined &&
          data.message !== undefined
        ) {
          // Only show if this chat is currently open
          if (String(data.sender_id) === String(receiverId)) {
            setMessages((oldMessages) => [
              ...oldMessages,
              {
                text: data.message,
                sender: "other",
                userId: data.sender_id,
              },
            ]);
          }

          return;
        }

        // Sent message confirmation
        if (data.status === "sent") {
          setMessages((oldMessages) => [
            ...oldMessages,
            {
              text: data.message,
              sender: "me",
              userId: userId,
            },
          ]);

          return;
        }

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

    setMessages([]);

    // Load previous chat messages
    try {
      const response = await fetch(`${API_URL}/messages/${userId}/${id}`);

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      const formattedMessages = data.map((msg) => ({
        text: msg.message,

        sender: String(msg.sender_id) === String(userId) ? "me" : "other",

        userId: msg.sender_id,
      }));

      setMessages(formattedMessages);
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

    websocket.current.send(
      JSON.stringify({
        receiver_id: Number(receiverId),

        message: message.trim(),
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
      <div className="chat-app">
        {/* LEFT SIDE */}

        <div className="users">
          <h2>Private Chat</h2>

          <p className="my-user">
            {username} (User {userId})
          </p>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>

          <div
            className={`user ${receiverId === "1" ? "selected" : ""}`}
            onClick={() => selectUser(1)}>
            User 1
          </div>

          <div
            className={`user ${receiverId === "2" ? "selected" : ""}`}
            onClick={() => selectUser(2)}>
            User 2
          </div>

          <div
            className={`user ${receiverId === "3" ? "selected" : ""}`}
            onClick={() => selectUser(3)}>
            User 3
          </div>
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
              <div className="chat-header">User {receiverId}</div>

              <div className="messages">
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.sender}`}>
                    {msg.text}
                  </div>
                ))}
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
