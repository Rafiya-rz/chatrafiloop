import { useEffect, useState } from "react";
import { Client } from "@stomp/stompjs";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8081";

const WS_URL = API_URL
  .replace("https://", "wss://")
  .replace("http://", "ws://");

function App() {
  const [currentUser, setCurrentUser] = useState(
    localStorage.getItem("connectChatUser") || ""
  );

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");

  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [error, setError] = useState("");

  function getAuthHeaders() {
    const token = localStorage.getItem("connectChatToken");

    return token
      ? { Authorization: `Bearer ${token}` }
      : {};
  }

  useEffect(() => {
    if (currentUser) {
      loadUsers();
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && selectedUser) {
      loadMessages();
    }
  }, [currentUser, selectedUser]);

  useEffect(() => {
    if (!currentUser || !selectedUser) return;

    const token = localStorage.getItem("connectChatToken");

    const client = new Client({
      brokerURL: `${WS_URL}/ws`,
      reconnectDelay: 5000,
      connectHeaders: token
        ? { Authorization: `Bearer ${token}` }
        : {},

      onConnect: () => {
        client.subscribe("/topic/messages", (frame) => {
          const message = JSON.parse(frame.body);
          client.subscribe("/topic/deleted-messages", (frame) => {
  const deletedMessageId = Number(frame.body);

  setMessages((oldMessages) =>
    oldMessages.filter(
      (message) => message.id !== deletedMessageId
    )
  );
});

          const belongsToCurrentChat =
            (message.sender.trim().toLowerCase() === currentUser.trim().toLowerCase()&&
              message.receiver === selectedUser) ||
            (message.sender === selectedUser &&
              message.receiver === currentUser);

          if (!belongsToCurrentChat) return;

          setMessages((oldMessages) => {
            const alreadyExists = oldMessages.some(
              (oldMessage) => oldMessage.id === message.id
            );

            return alreadyExists
              ? oldMessages
              : [...oldMessages, message];
          });
        });
      },
    });

    client.activate();

    return () => {
      client.deactivate();
    };
  }, [currentUser, selectedUser]);

  async function loadUsers() {
    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error();

      const data = await response.json();
      const otherUsers = data.filter((user) => user !== currentUser);

      setUsers(otherUsers);

      setSelectedUser((oldUser) => {
        if (oldUser) return oldUser;

        return otherUsers.includes("friend")
          ? "friend"
          : otherUsers[0] || "";
      });
    } catch {
      setError("Cannot load registered users.");
    }
  }

  async function loadMessages() {
    try {
      setError("");

      const response = await fetch(
        `${API_URL}/messages/chat?firstUser=${encodeURIComponent(
          currentUser
        )}&secondUser=${encodeURIComponent(selectedUser)}`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) throw new Error();

      setMessages(await response.json());
    } catch {
      setError("Cannot load messages.");
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    const endpoint =
      authMode === "login" ? "/users/login" : "/users/register";

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        setAuthError(text || "Login failed.");
        return;
      }

      if (authMode === "register") {
        setAuthMessage("Registration successful. Now sign in.");
        setAuthMode("login");
        setPassword("");
        return;
      }

      const data = await response.json();

      localStorage.setItem("connectChatUser", data.username);
      localStorage.setItem("connectChatToken", data.token);

      setCurrentUser(data.username);
      setPassword("");
    } catch {
      setAuthError("Cannot connect to the backend.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!selectedUser || newMessage.trim() === "") return;

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          sender: currentUser,
          receiver: selectedUser,
          text: newMessage,
        }),
      });

      if (!response.ok) throw new Error();

      const savedMessage = await response.json();

      setMessages((oldMessages) => {
        const alreadyExists = oldMessages.some(
          (oldMessage) => oldMessage.id === savedMessage.id
        );

        return alreadyExists
          ? oldMessages
          : [...oldMessages, savedMessage];
      });

      setNewMessage("");
    } catch {
      setError("Message was not sent.");
    }
  }

  async function deleteMessage(id) {
    try {
      const response = await fetch(`${API_URL}/messages/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error();

      setMessages((oldMessages) =>
        oldMessages.filter((message) => message.id !== id)
      );
    } catch {
      setError("Message could not be deleted.");
    }
  }

  function logout() {
    localStorage.removeItem("connectChatUser");
    localStorage.removeItem("connectChatToken");

    setCurrentUser("");
    setSelectedUser("");
    setMessages([]);
  }

  if (!currentUser) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>ConnectChat</h1>
          <p>
            {authMode === "login"
              ? "Welcome back"
              : "Create your account"}
          </p>

          <form onSubmit={handleAuth}>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              required
            />

            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Password"
              required
            />

            <button type="submit">
              {authMode === "login" ? "Login" : "Register"}
            </button>
          </form>

          {authMessage && (
            <p className="success-message">{authMessage}</p>
          )}

          {authError && (
            <p className="error-message">{authError}</p>
          )}

          <button
            className="switch-button"
            onClick={() => {
              setAuthMode(authMode === "login" ? "register" : "login");
              setAuthError("");
              setAuthMessage("");
            }}
          >
            {authMode === "login"
              ? "New user? Register here"
              : "Already have an account? Login"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="chat-card">
        <aside className="sidebar">
          <h1>ConnectChat</h1>
          <p className="subtitle">Logged in as {currentUser}</p>

          <div className="contact-list">
            {users.map((user) => (
              <button
                key={user}
                className={`contact ${
                  selectedUser === user ? "active" : ""
                }`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="avatar">
                  {user[0].toUpperCase()}
                </div>

                <div>
                  <strong>{user}</strong>
                  <p>Registered user</p>
                </div>
              </button>
            ))}
          </div>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </aside>

        <section className="chat-area">
          <header className="chat-header">
            <div className="avatar">
              {selectedUser ? selectedUser[0].toUpperCase() : "?"}
            </div>

            <div>
              <h2>{selectedUser || "Select a user"}</h2>
              <p>
                {selectedUser
                  ? "Registered user"
                  : "Choose a chat"}
              </p>
            </div>
          </header>

          <div className="messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${
                  message.sender.trim().toLowerCase() === currentUser.trim().toLowerCase()? "mine" : ""
                }`}
              >
                <span>{message.text}</span>

                <small>
                  {new Date(message.sentAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>

                {message.sender.trim().toLowerCase() === currentUser.trim().toLowerCase()&& (
                  <button
                    className="delete-button"
                    onClick={() => deleteMessage(message.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}

            {selectedUser && messages.length === 0 && (
              <p>No messages yet.</p>
            )}

            {error && (
              <p className="error-message">{error}</p>
            )}
          </div>

          <form className="message-form" onSubmit={sendMessage}>
            <input
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder={
                selectedUser
                  ? "Type a message..."
                  : "Select a user first"
              }
              disabled={!selectedUser}
            />

            <button type="submit" disabled={!selectedUser}>
              Send
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

export default App;
