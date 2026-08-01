import { useEffect, useState } from "react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8081";

function App() {
  const [currentUser, setCurrentUser] = useState(
    localStorage.getItem("connectChatUser") || ""
  );

  const [token, setToken] = useState(
    localStorage.getItem("connectChatToken") || ""
  );

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const [authMode, setAuthMode] = useState("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [messageError, setMessageError] = useState("");

  function getAuthHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function loadUsers() {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) return;

      const data = await response.json();

      const otherUsers = data.filter(
        (user) =>
          user.trim().toLowerCase() !== currentUser.trim().toLowerCase()
      );

      setUsers(otherUsers);

      if (!selectedUser && otherUsers.length > 0) {
        setSelectedUser(otherUsers[0]);
      }
    } catch {
      setMessageError("Cannot load users.");
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
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      setMessages(data);
    } catch {
      setMessageError("Cannot load messages.");
    }
  }

  useEffect(() => {
    loadUsers();
  }, [token, currentUser]);

  useEffect(() => {
    loadMessages();

    const refreshMessages = setInterval(() => {
      loadMessages();
    }, 2000);

    return () => clearInterval(refreshMessages);
  }, [token, currentUser, selectedUser]);

  async function handleAuth(event) {
    event.preventDefault();
    setAuthError("");

    const endpoint =
      authMode === "register" ? "/users/register" : "/users/login";

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setAuthError(
          typeof data === "string"
            ? data
            : data?.error || "Registration or login failed."
        );
        return;
      }

      if (authMode === "register") {
        setAuthError("Registration successful. Now click Login.");
        setAuthMode("login");
        return;
      }

      localStorage.setItem("connectChatUser", data.username);
      localStorage.setItem("connectChatToken", data.token);

      setCurrentUser(data.username);
      setToken(data.token);
      setUsername("");
      setPassword("");
    } catch {
      setAuthError("Cannot connect to the backend.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!newMessage.trim() || !selectedUser) return;

    setMessageError("");

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          sender: currentUser,
          receiver: selectedUser,
          text: newMessage.trim(),
        }),
      });

      if (!response.ok) {
        setMessageError("Message could not be sent.");
        return;
      }

      setNewMessage("");

      // This loads the new message immediately.
      await loadMessages();
    } catch {
      setMessageError("Message could not be sent.");
    }
  }

  async function deleteMessage(id) {
    try {
      const response = await fetch(`${API_URL}/messages/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        setMessageError("Message could not be deleted.");
        return;
      }

      await loadMessages();
    } catch {
      setMessageError("Message could not be deleted.");
    }
  }

  function logout() {
    localStorage.removeItem("connectChatUser");
    localStorage.removeItem("connectChatToken");

    setCurrentUser("");
    setToken("");
    setMessages([]);
    setSelectedUser("");
    setUsers([]);
  }

  function formatTime(sentAt) {
    if (!sentAt) return "";

    const date = new Date(sentAt);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (!currentUser || !token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>ConnectChat</h1>

          <p>
            {authMode === "register"
              ? "Create your account"
              : "Login to your account"}
          </p>

          <form onSubmit={handleAuth}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button type="submit">
              {authMode === "register" ? "Register" : "Login"}
            </button>
          </form>

          {authError && <p className="error-message">{authError}</p>}

          <button
            className="link-button"
            onClick={() =>
              setAuthMode(authMode === "register" ? "login" : "register")
            }
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
        <h1>ConnectChat</h1>
        <p>Logged in as {currentUser}</p>

        <section className="user-list">
          {users.map((user) => (
            <button
              key={user}
              className={`user-item ${
                selectedUser === user ? "selected-user" : ""
              }`}
              onClick={() => setSelectedUser(user)}
            >
              <span className="avatar">{user.charAt(0).toUpperCase()}</span>

              <span>
                <strong>{user}</strong>
                <small>Registered user</small>
              </span>
            </button>
          ))}
        </section>

        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <span className="avatar">
            {selectedUser ? selectedUser.charAt(0).toUpperCase() : "?"}
          </span>

          <div>
            <h2>{selectedUser || "Select a user"}</h2>
            <small>Registered user</small>
          </div>
        </header>

        <section className="messages-area">
          {messages.length === 0 ? (
            <p>No messages yet.</p>
          ) : (
            messages.map((message) => {
              const isMine =
                message.sender?.trim().toLowerCase() ===
                currentUser.trim().toLowerCase();

              return (
                <article
                  key={message.id}
                  className={`message ${isMine ? "my-message" : "other-message"}`}
                >
                  <p>{message.text}</p>
                  <small>{formatTime(message.sentAt)}</small>

                  {isMine && (
                    <button onClick={() => deleteMessage(message.id)}>
                      Delete
                    </button>
                  )}
                </article>
              );
            })
          )}

          {messageError && <p className="error-message">{messageError}</p>}
        </section>

        <form className="message-form" onSubmit={sendMessage}>
          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            disabled={!selectedUser}
          />

          <button type="submit" disabled={!selectedUser}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;