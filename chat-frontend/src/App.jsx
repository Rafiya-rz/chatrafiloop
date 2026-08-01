import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8081";

const normalise = (value = "") =>
  String(value).trim().toLowerCase();

function App() {
  const [currentUser, setCurrentUser] = useState(
    () => localStorage.getItem("connectChatUser") || ""
  );
  const [token, setToken] = useState(
    () => localStorage.getItem("connectChatToken") || ""
  );

  const [authMode, setAuthMode] = useState("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [messageError, setMessageError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const knownMessageIds = useRef(new Set());
  const firstMessagesLoad = useRef(true);
  const messagesEndRef = useRef(null);

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  function formatTime(value) {
    if (!value) return "";

    let text = String(value);

    // Java can send extra decimal places; browsers prefer milliseconds.
    text = text.replace(/\.(\d{3})\d+/, ".$1");

    // A deployed server sends its time in UTC without Z.
    if (text.includes("T") && !text.endsWith("Z")) {
      text = `${text}Z`;
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function loadUsers() {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error("Could not load users.");
      }

      const data = await response.json();
      const otherUsers = data.filter(
        (user) => normalise(user) !== normalise(currentUser)
      );

      setUsers(otherUsers);

      setSelectedUser((oldSelectedUser) => {
        const stillExists = otherUsers.some(
          (user) => normalise(user) === normalise(oldSelectedUser)
        );

        return stillExists ? oldSelectedUser : otherUsers[0] || "";
      });
    } catch {
      setMessageError("Could not load registered users.");
    }
  }

  async function loadMessages() {
    if (!token || !currentUser || !selectedUser) return;

    try {
      const response = await fetch(
        `${API_URL}/messages/chat?firstUser=${encodeURIComponent(
          currentUser
        )}&secondUser=${encodeURIComponent(selectedUser)}`,
        {
          headers: authHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error("Could not load messages.");
      }

      const data = await response.json();

      const orderedMessages = [...data].sort(
        (first, second) =>
          new Date(first.sentAt) - new Date(second.sentAt)
      );

      if (!firstMessagesLoad.current) {
        const newIncomingMessages = orderedMessages.filter(
          (message) =>
            !knownMessageIds.current.has(String(message.id)) &&
            normalise(message.sender) !== normalise(currentUser)
        );

        if (newIncomingMessages.length > 0) {
          setUnreadCount((count) => count + newIncomingMessages.length);

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("ConnectChat", {
              body: "You received a new message.",
            });
          }
        }
      }

      knownMessageIds.current = new Set(
        orderedMessages.map((message) => String(message.id))
      );

      firstMessagesLoad.current = false;
      setMessages(orderedMessages);
      setMessageError("");
    } catch {
      setMessageError("Could not load messages.");
    }
  }

  useEffect(() => {
    if (token && currentUser) {
      loadUsers();
    }
  }, [token, currentUser]);

  useEffect(() => {
    if (!token || !currentUser || !selectedUser) return;

    knownMessageIds.current = new Set();
    firstMessagesLoad.current = true;
    setMessages([]);
    setUnreadCount(0);

    loadMessages();

    const intervalId = setInterval(loadMessages, 2000);

    return () => clearInterval(intervalId);
  }, [token, currentUser, selectedUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  async function handleRegister(event) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setAuthError("Enter a username and password.");
      return;
    }

    setSubmitting(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(`${API_URL}/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "Registration failed.");
      }

      setAuthMode("login");
      setAuthMessage("Registration successful. Now log in.");
      setPassword("");
    } catch (error) {
      setAuthError(error.message || "Cannot connect to the backend.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setAuthError("Enter a username and password.");
      return;
    }

    setSubmitting(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(data.error || "Login failed.");
      }

      localStorage.setItem("connectChatUser", data.username);
      localStorage.setItem("connectChatToken", data.token);

      setCurrentUser(data.username);
      setToken(data.token);
      setPassword("");

      if (
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission();
      }
    } catch (error) {
      setAuthError(error.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!newMessage.trim() || !selectedUser) return;

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sender: currentUser,
          receiver: selectedUser,
          text: newMessage.trim(),
        }),
      });

      const savedMessage = await response.json();

      if (!response.ok) {
        throw new Error("Message could not be sent.");
      }

      knownMessageIds.current.add(String(savedMessage.id));

      setMessages((oldMessages) => [
        ...oldMessages,
        savedMessage,
      ]);

      setNewMessage("");
      setMessageError("");
    } catch {
      setMessageError("Message could not be sent.");
    }
  }

  async function deleteMessage(messageId) {
    const shouldDelete = window.confirm(
      "Do you want to delete this message?"
    );

    if (!shouldDelete) return;

    try {
      const response = await fetch(
        `${API_URL}/messages/${messageId}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error();
      }

      setMessages((oldMessages) =>
        oldMessages.filter((message) => message.id !== messageId)
      );

      knownMessageIds.current.delete(String(messageId));
      setMessageError("");
    } catch {
      setMessageError("Message could not be deleted.");
    }
  }

  function logout() {
    localStorage.removeItem("connectChatUser");
    localStorage.removeItem("connectChatToken");

    setCurrentUser("");
    setToken("");
    setUsers([]);
    setSelectedUser("");
    setMessages([]);
    setUsername("");
    setPassword("");
    setAuthMode("login");
    setUnreadCount(0);
  }

  if (!token || !currentUser) {
    const isRegisterMode = authMode === "register";

    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>ConnectChat</h1>

          <p>{isRegisterMode ? "Create your account" : "Welcome back"}</p>

          <form
            onSubmit={isRegisterMode ? handleRegister : handleLogin}
          >
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <button type="submit" disabled={submitting}>
              {submitting
                ? "Please wait..."
                : isRegisterMode
                ? "Register"
                : "Login"}
            </button>
          </form>

          {authError && <p className="error-message">{authError}</p>}
          {authMessage && <p className="success-message">{authMessage}</p>}

          <button
            className="auth-switch"
            onClick={() => {
              setAuthMode(isRegisterMode ? "login" : "register");
              setAuthError("");
              setAuthMessage("");
            }}
          >
            {isRegisterMode
              ? "Already have an account? Login"
              : "Need an account? Register"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-app">
      <aside className="sidebar">
        <h1>ConnectChat</h1>
        <p>Logged in as {currentUser}</p>

        <div className="user-list">
          {users.map((user) => (
            <button
              key={user}
              className={`user-item ${
                normalise(user) === normalise(selectedUser)
                  ? "selected-user"
                  : ""
              }`}
              onClick={() => setSelectedUser(user)}
            >
              <span className="avatar">
                {user.charAt(0).toUpperCase()}
              </span>

              <span>
                <strong>{user}</strong>
                <small>Registered user</small>
              </span>

              {normalise(user) === normalise(selectedUser) &&
                unreadCount > 0 && (
                  <span className="notification-badge">
                    {unreadCount}
                  </span>
                )}
            </button>
          ))}
        </div>

        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className="chat-panel">
        {selectedUser ? (
          <>
            <header className="chat-header">
              <span className="avatar">
                {selectedUser.charAt(0).toUpperCase()}
              </span>

              <div>
                <h2>{selectedUser}</h2>
                <small>Registered user</small>
              </div>
            </header>

            <section className="messages-area">
              {messages.length === 0 ? (
                <p>No messages yet.</p>
              ) : (
                messages.map((message) => {
                  const isMine =
                    normalise(message.sender) ===
                    normalise(currentUser);

                  return (
                    <article
                      key={message.id}
                      className={`message ${
                        isMine
                          ? "my-message"
                          : "other-message"
                      }`}
                    >
                      <p>{message.text}</p>
                      <small>{formatTime(message.sentAt)}</small>

                      {isMine && (
                        <button
                          className="delete-button"
                          onClick={() =>
                            deleteMessage(message.id)
                          }
                        >
                          Delete
                        </button>
                      )}
                    </article>
                  );
                })
              )}

              <div ref={messagesEndRef} />
            </section>

            {messageError && (
              <p className="error-message">{messageError}</p>
            )}

            <form className="message-form" onSubmit={sendMessage}>
              <input
                value={newMessage}
                onChange={(event) =>
                  setNewMessage(event.target.value)
                }
                placeholder="Type a message..."
              />

              <button type="submit" disabled={!newMessage.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <section className="messages-area">
            <p>No other registered users yet.</p>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;