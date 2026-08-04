import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8081"
).replace(/\/$/, "");

function normalize(value = "") {
  return String(value).trim().toLowerCase();
}

function sameUser(first, second) {
  return normalize(first) === normalize(second);
}

function messageId(message) {
  return (
    message.id ??
    `${message.sender}-${message.receiver}-${message.text}-${message.sentAt}`
  );
}

function sortMessages(list) {
  return [...list].sort(
    (first, second) =>
      new Date(first.sentAt).getTime() - new Date(second.sentAt).getTime()
  );
}

function formatTime(value) {
  if (!value) return "";

  // Spring Boot may send a date without timezone.
  const safeValue =
    /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;

  const date = new Date(safeValue);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isConversation(message, firstUser, secondUser) {
  return (
    (sameUser(message.sender, firstUser) &&
      sameUser(message.receiver, secondUser)) ||
    (sameUser(message.sender, secondUser) &&
      sameUser(message.receiver, firstUser))
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(
    () => localStorage.getItem("connectChatUser") || ""
  );
  const [token, setToken] = useState(
    () => localStorage.getItem("connectChatToken") || ""
  );

  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [allMessages, setAllMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [messageError, setMessageError] = useState("");
  const [unread, setUnread] = useState({});
  const [popup, setPopup] = useState(null);

  const knownMessageIds = useRef(new Set());
  const firstMessageLoad = useRef(true);
  const currentUserRef = useRef("");
  const selectedUserRef = useRef("");

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  function getAuthHeaders() {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function readResponse(response) {
    const text = await response.text();

    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  }

  async function loadUsers() {
    const response = await fetch(`${API_URL}/users`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error("Could not load users.");
    }

    const data = await readResponse(response);
    const userList = Array.isArray(data) ? data : [];

    const otherUsers = userList.filter(
      (user) => !sameUser(user, currentUserRef.current)
    );

    setUsers(otherUsers);

    if (
      !selectedUserRef.current ||
      !otherUsers.some((user) => sameUser(user, selectedUserRef.current))
    ) {
      setSelectedUser(otherUsers[0] || "");
    }
  }

  async function refreshMessages() {
    const response = await fetch(`${API_URL}/messages`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      return;
    }

    const data = await readResponse(response);
    const receivedMessages = Array.isArray(data) ? sortMessages(data) : [];

    const isFirstLoad = firstMessageLoad.current;

    receivedMessages.forEach((message) => {
      const id = messageId(message);

      if (knownMessageIds.current.has(id)) {
        return;
      }

      knownMessageIds.current.add(id);

      const receivedForMe =
        sameUser(message.receiver, currentUserRef.current) &&
        !sameUser(message.sender, currentUserRef.current);

      if (!isFirstLoad && receivedForMe) {
        const sender = message.sender;

        setPopup({
          sender,
          text: message.text,
        });

        if (!sameUser(sender, selectedUserRef.current)) {
          setUnread((previous) => ({
            ...previous,
            [sender]: (previous[sender] || 0) + 1,
          }));
        }

        if (Notification.permission === "granted") {
          new Notification(`New message from ${sender}`, {
            body: message.text,
          });
        }
      }
    });

    firstMessageLoad.current = false;
    setAllMessages(receivedMessages);
  }

  async function handleAuth(event) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setAuthError("Enter both username and password.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const endpoint =
        authMode === "login" ? "/users/login" : "/users/register";

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

      const data = await readResponse(response);

      if (!response.ok) {
        const errorText =
          typeof data === "string"
            ? data
            : data?.error || "Request failed. Please try again.";

        throw new Error(errorText);
      }

      if (authMode === "register") {
        setAuthMessage("Account created. Now log in.");
        setAuthMode("login");
        setPassword("");
        return;
      }

      if (!data?.token || !data?.username) {
        throw new Error("Login failed. Please check your username and password.");
      }

      localStorage.setItem("connectChatUser", data.username);
      localStorage.setItem("connectChatToken", data.token);

      knownMessageIds.current = new Set();
      firstMessageLoad.current = true;

      setCurrentUser(data.username);
      setToken(data.token);
      setPassword("");
    } catch (error) {
      setAuthError(error.message || "Cannot connect to the backend.");
    } finally {
      setAuthBusy(false);
    }
  }

  function chooseUser(user) {
    setSelectedUser(user);
    setUnread((previous) => ({
      ...previous,
      [user]: 0,
    }));
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!selectedUser || !newMessage.trim()) {
      return;
    }

    setMessageError("");

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
          text: newMessage.trim(),
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          typeof data === "string"
            ? data
            : data?.error || "Could not send message."
        );
      }

      knownMessageIds.current.add(messageId(data));

      setAllMessages((previous) =>
        sortMessages([
          ...previous.filter((message) => messageId(message) !== messageId(data)),
          data,
        ])
      );

      setNewMessage("");
    } catch (error) {
      setMessageError(error.message || "Could not send message.");
    }
  }

  async function deleteMessage(id) {
    setMessageError("");

    try {
      const response = await fetch(`${API_URL}/messages/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Message could not be deleted.");
      }

      setAllMessages((previous) =>
        previous.filter((message) => message.id !== id)
      );
    } catch (error) {
      setMessageError(error.message || "Message could not be deleted.");
    }
  }

  function logout() {
    localStorage.removeItem("connectChatUser");
    localStorage.removeItem("connectChatToken");

    setCurrentUser("");
    setToken("");
    setUsers([]);
    setSelectedUser("");
    setAllMessages([]);
    setUnread({});
    setPopup(null);
    setUsername("");
    setPassword("");
    setAuthMode("login");
  }

  function enableBrowserAlerts() {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  }

  useEffect(() => {
    if (!currentUser || !token) {
      return;
    }

    loadUsers().catch(() => {
      setMessageError("Could not load users.");
    });

    refreshMessages().catch(() => {
      setMessageError("Could not load messages.");
    });

    const interval = setInterval(() => {
      refreshMessages().catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [currentUser, token]);

  useEffect(() => {
    if (!popup) {
      return;
    }

    const timeout = setTimeout(() => setPopup(null), 4500);

    return () => clearTimeout(timeout);
  }, [popup]);

  const messages = selectedUser
    ? sortMessages(
        allMessages.filter((message) =>
          isConversation(message, currentUser, selectedUser)
        )
      )
    : [];

  if (!currentUser || !token) {
    const isLogin = authMode === "login";

    return (
      <main className="auth-page">
        <form className="auth-card" onSubmit={handleAuth}>
          <h1>ConnectChat</h1>
          <p>{isLogin ? "Log in to continue" : "Create your account"}</p>

          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />

          <button type="submit" disabled={authBusy}>
            {authBusy ? "Please wait..." : isLogin ? "Login" : "Register"}
          </button>

          {authError && <p className="auth-error">{authError}</p>}
          {authMessage && <p className="auth-success">{authMessage}</p>}

          <button
            type="button"
            className="switch-button"
            onClick={() => {
              setAuthMode(isLogin ? "register" : "login");
              setAuthError("");
              setAuthMessage("");
            }}
          >
            {isLogin
              ? "Need an account? Register"
              : "Already have an account? Login"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="chat-app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>ConnectChat</h1>
          <p>Logged in as {currentUser}</p>
        </div>

        <div className="user-list">
          {users.length === 0 && (
            <p className="empty-users">No other users yet.</p>
          )}

          {users.map((user) => (
            <button
              key={user}
              className={`user-item ${
                sameUser(user, selectedUser) ? "selected-user" : ""
              }`}
              onClick={() => chooseUser(user)}
            >
              <span className="avatar">{user.charAt(0).toUpperCase()}</span>

              <span className="user-details">
                <strong>{user}</strong>
                <small>Registered user</small>
              </span>

              {unread[user] > 0 && (
                <span className="unread-badge">{unread[user]}</span>
              )}
            </button>
          ))}
        </div>

        <button className="alert-button" onClick={enableBrowserAlerts}>
          Enable alerts
        </button>

        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          {selectedUser ? (
            <>
              <span className="avatar">
                {selectedUser.charAt(0).toUpperCase()}
              </span>
              <div>
                <h2>{selectedUser}</h2>
                <small>Registered user</small>
              </div>
            </>
          ) : (
            <h2>Select a user</h2>
          )}
        </header>

        <section className="messages-area">
          {messages.length === 0 ? (
            <p className="no-messages">No messages yet.</p>
          ) : (
            messages.map((message) => {
              const isMine = sameUser(message.sender, currentUser);

              return (
                <article
                  className={`message ${
                    isMine ? "my-message" : "other-message"
                  }`}
                  key={messageId(message)}
                >
                  <p>{message.text}</p>
                  <small>{formatTime(message.sentAt)}</small>

                  {isMine && (
                    <button
                      className="delete-button"
                      onClick={() => deleteMessage(message.id)}
                    >
                      Delete
                    </button>
                  )}
                </article>
              );
            })
          )}

          {messageError && (
            <p className="error-message">{messageError}</p>
          )}
        </section>

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

      {popup && (
        <button
          className="message-popup"
          onClick={() => {
            chooseUser(popup.sender);
            setPopup(null);
          }}
        >
          <strong>New message from {popup.sender}</strong>
          <span>{popup.text}</span>
        </button>
      )}
    </main>
  );
}