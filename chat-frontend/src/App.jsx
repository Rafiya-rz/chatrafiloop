import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8081"
).replace(/\/$/, "");

function normalize(value = "") {
  return String(value).trim().toLowerCase();
}

function formatTime(value) {
  if (!value) return "";

  const dateValue = /[zZ]|[+-]\d{2}:\d{2}$/.test(value)
    ? value
    : `${value}Z`;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function App() {
  const [currentUser, setCurrentUser] = useState(
    localStorage.getItem("connectChatUser") || ""
  );
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [messages, setMessages] = useState([]);

  const [authMode, setAuthMode] = useState("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  const [newMessage, setNewMessage] = useState("");
  const [messageError, setMessageError] = useState("");

  const messageEndRef = useRef(null);

  function getHeaders() {
    const token = localStorage.getItem("connectChatToken");

    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  function logout() {
    localStorage.removeItem("connectChatUser");
    localStorage.removeItem("connectChatToken");

    setCurrentUser("");
    setUsers([]);
    setSelectedUser("");
    setMessages([]);
    setUsername("");
    setPassword("");
    setAuthError("");
    setAuthInfo("");
  }

  async function handleRegister(event) {
    event.preventDefault();

    setAuthError("");
    setAuthInfo("");

    try {
      const response = await fetch(`${API_URL}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "Registration failed.");
      }

      setAuthInfo("Registration successful. Please log in.");
      setAuthMode("login");
      setPassword("");
    } catch (error) {
      setAuthError(error.message || "Cannot connect to the backend.");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    setAuthError("");
    setAuthInfo("");

    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Login failed.");
      }

      localStorage.setItem("connectChatUser", data.username);
      localStorage.setItem("connectChatToken", data.token);

      setCurrentUser(data.username);
      setUsername("");
      setPassword("");
    } catch (error) {
      setAuthError(error.message || "Cannot connect to the backend.");
    }
  }

  useEffect(() => {
    if (!currentUser) return;

    async function loadUsers() {
      try {
        const response = await fetch(`${API_URL}/users`, {
          headers: getHeaders(),
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        const otherUsers = data.filter(
          (user) => normalize(user) !== normalize(currentUser)
        );

        setUsers(otherUsers);

        setSelectedUser((oldUser) => {
          if (otherUsers.includes(oldUser)) {
            return oldUser;
          }

          return otherUsers[0] || "";
        });
      } catch {
        // The next automatic refresh will try again.
      }
    }

    loadUsers();

    const timer = window.setInterval(loadUsers, 5000);

    return () => window.clearInterval(timer);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedUser) {
      setMessages([]);
      return;
    }

    let isActive = true;

    async function loadMessages() {
      try {
        const url =
          `${API_URL}/messages/chat?firstUser=${encodeURIComponent(currentUser)}` +
          `&secondUser=${encodeURIComponent(selectedUser)}`;

        const response = await fetch(url, {
          headers: getHeaders(),
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        const sortedMessages = [...data].sort((first, second) => {
          return new Date(first.sentAt) - new Date(second.sentAt);
        });

        if (isActive) {
          setMessages(sortedMessages);
          setMessageError("");
        }
      } catch {
        if (isActive) {
          setMessageError("Messages could not be loaded.");
        }
      }
    }

    loadMessages();

    const timer = window.setInterval(loadMessages, 2000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [currentUser, selectedUser]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  async function sendMessage(event) {
    event.preventDefault();

    const text = newMessage.trim();

    if (!text || !selectedUser) {
      return;
    }

    setMessageError("");

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          sender: currentUser,
          receiver: selectedUser,
          text,
        }),
      });

      const savedMessage = await response.json().catch(() => null);

      if (!response.ok || !savedMessage) {
        throw new Error("Message could not be sent.");
      }

      setMessages((oldMessages) => {
        const alreadyExists = oldMessages.some(
          (message) => message.id === savedMessage.id
        );

        return alreadyExists
          ? oldMessages
          : [...oldMessages, savedMessage];
      });

      setNewMessage("");
    } catch (error) {
      setMessageError(error.message || "Message could not be sent.");
    }
  }

  async function deleteMessage(messageId) {
    try {
      const response = await fetch(`${API_URL}/messages/${messageId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error("Message could not be deleted.");
      }

      setMessages((oldMessages) =>
        oldMessages.filter((message) => message.id !== messageId)
      );
    } catch (error) {
      setMessageError(error.message || "Message could not be deleted.");
    }
  }

  if (!currentUser) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>ConnectChat</h1>
          <p>{authMode === "register" ? "Create your account" : "Welcome back"}</p>

          <form
            onSubmit={authMode === "register" ? handleRegister : handleLogin}
          >
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              required
            />

            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              required
            />

            <button type="submit">
              {authMode === "register" ? "Register" : "Login"}
            </button>
          </form>

          {authError && <p className="auth-error">{authError}</p>}
          {authInfo && <p className="auth-info">{authInfo}</p>}

          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setAuthMode(authMode === "register" ? "login" : "register");
              setAuthError("");
              setAuthInfo("");
            }}
          >
            {authMode === "register"
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
        <div>
          <h1>ConnectChat</h1>
          <p>Logged in as {currentUser}</p>
        </div>

        <div className="user-list">
          {users.map((user) => (
            <button
              type="button"
              key={user}
              className={
                selectedUser === user
                  ? "user-item selected-user"
                  : "user-item"
              }
              onClick={() => setSelectedUser(user)}
            >
              <span className="avatar">{user.charAt(0).toUpperCase()}</span>

              <span className="user-details">
                <strong>{user}</strong>
                <small>Registered user</small>
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="logout-button" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <span className="avatar">
            {selectedUser ? selectedUser.charAt(0).toUpperCase() : "?"}
          </span>

          <div>
            <h2>{selectedUser || "Choose a user"}</h2>
            <small>{selectedUser ? "Registered user" : "Select a person to chat"}</small>
          </div>
        </header>

        <section className="messages-area">
          {!selectedUser && <p>Select a user from the left side.</p>}

          {selectedUser && messages.length === 0 && (
            <p>No messages yet.</p>
          )}

          {messages.map((message) => {
            const isMine =
              normalize(message.sender) === normalize(currentUser);

            return (
              <article
                key={message.id}
                className={isMine ? "message my-message" : "message other-message"}
              >
                <p>{message.text}</p>
                <small>{formatTime(message.sentAt)}</small>

                {isMine && (
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => deleteMessage(message.id)}
                  >
                    Delete
                  </button>
                )}
              </article>
            );
          })}

          <div ref={messageEndRef} />
        </section>

        {messageError && <p className="error-message">{messageError}</p>}

        <form className="message-form" onSubmit={sendMessage}>
          <input
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder={
              selectedUser ? "Type a message..." : "Select a user first"
            }
            disabled={!selectedUser}
          />

          <button type="submit" disabled={!selectedUser || !newMessage.trim()}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;