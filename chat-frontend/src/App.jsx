import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8081").replace(
  /\/$/,
  ""
);

function sameUser(first, second) {
  return String(first || "").trim().toLowerCase() ===
    String(second || "").trim().toLowerCase();
}

function messageKey(message) {
  return String(message.id ?? `${message.sender}-${message.receiver}-${message.sentAt}-${message.text}`);
}

function sortMessages(list) {
  return [...list].sort(
    (first, second) =>
      new Date(first.sentAt || 0).getTime() - new Date(second.sentAt || 0).getTime()
  );
}

function formatTime(value) {
  if (!value) return "";

  const text = String(value);
  const date = new Date(
    text.endsWith("Z") || text.includes("+") ? text : `${text}Z`
  );

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
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
  const [authMessage, setAuthMessage] = useState("");

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [messageError, setMessageError] = useState("");

  const [unreadCounts, setUnreadCounts] = useState({});
  const [popup, setPopup] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  const knownMessageIds = useRef(new Set());
  const historyLoaded = useRef(false);
  const popupTimer = useRef(null);
  const messagesEndRef = useRef(null);

  function getHeaders(json = false) {
    const headers = {};

    if (json) {
      headers["Content-Type"] = "application/json";
    }

    const savedToken = token || localStorage.getItem("connectChatToken");

    if (savedToken) {
      headers.Authorization = `Bearer ${savedToken}`;
    }

    return headers;
  }

  function showPopup(text) {
    setPopup(text);

    clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => {
      setPopup("");
    }, 4000);
  }

  async function loadUsers() {
    try {
      const response = await fetch(`${API_URL}/users`, {
        headers: getHeaders(),
      });

      if (!response.ok) return;

      const data = await readResponse(response);
      const userList = Array.isArray(data) ? data : [];

      const otherUsers = userList.filter((user) => !sameUser(user, currentUser));
      setUsers(otherUsers);

      if (!selectedUser && otherUsers.length > 0) {
        setSelectedUser(otherUsers[0]);
      }
    } catch {
      // The next refresh will try again.
    }
  }

  async function loadConversation() {
    if (!currentUser || !selectedUser) {
      setMessages([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/messages/chat?firstUser=${encodeURIComponent(
          currentUser
        )}&secondUser=${encodeURIComponent(selectedUser)}`,
        {
          headers: getHeaders(),
        }
      );

      if (!response.ok) return;

      const data = await readResponse(response);
      const conversation = Array.isArray(data) ? data : [];

      conversation.forEach((message) => {
        knownMessageIds.current.add(messageKey(message));
      });

      setMessages(sortMessages(conversation));
    } catch {
      setMessageError("Cannot load messages right now.");
    }
  }

  async function checkNewMessages() {
    if (!currentUser) return;

    try {
      const response = await fetch(`${API_URL}/messages`, {
        headers: getHeaders(),
      });

      if (!response.ok) return;

      const data = await readResponse(response);
      const allMessages = Array.isArray(data) ? data : [];

      if (!historyLoaded.current) {
        allMessages.forEach((message) => {
          knownMessageIds.current.add(messageKey(message));
        });

        historyLoaded.current = true;
        return;
      }

      allMessages.forEach((message) => {
        const id = messageKey(message);

        if (knownMessageIds.current.has(id)) return;

        knownMessageIds.current.add(id);

        const isIncoming = sameUser(message.receiver, currentUser);

        if (!isIncoming) return;

        if (sameUser(message.sender, selectedUser)) {
          setMessages((oldMessages) => sortMessages([...oldMessages, message]));
        } else {
          setUnreadCounts((oldCounts) => ({
            ...oldCounts,
            [message.sender]: (oldCounts[message.sender] || 0) + 1,
          }));
        }

        showPopup(`New message from ${message.sender}`);

        if (
          alertsEnabled &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(`ConnectChat: ${message.sender}`, {
            body: message.text,
          });
        }
      });
    } catch {
      // Poll again later.
    }
  }

  useEffect(() => {
    if (!currentUser || !token) return;

    knownMessageIds.current = new Set();
    historyLoaded.current = false;
    setUnreadCounts({});

    loadUsers();
    checkNewMessages();

    const timer = setInterval(checkNewMessages, 2000);

    return () => clearInterval(timer);
  }, [currentUser, token, selectedUser]);

  useEffect(() => {
    if (!currentUser || !selectedUser) return;

    setUnreadCounts((oldCounts) => ({
      ...oldCounts,
      [selectedUser]: 0,
    }));

    loadConversation();
  }, [selectedUser, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleAuth(event) {
    event.preventDefault();

    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      setAuthMessage("Enter both username and password.");
      return;
    }

    setAuthMessage("");

    try {
      const endpoint =
        authMode === "register" ? "/users/register" : "/users/login";

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        const error =
          typeof data === "object" && data?.error
            ? data.error
            : typeof data === "string"
              ? data
              : "Request failed.";

        setAuthMessage(error);
        return;
      }

      if (authMode === "register") {
        setAuthMessage("Registration successful. Now click Login.");
        setAuthMode("login");
        return;
      }

      if (!data?.token || !data?.username) {
        setAuthMessage("Login response is not correct.");
        return;
      }

      localStorage.setItem("connectChatUser", data.username);
      localStorage.setItem("connectChatToken", data.token);

      setCurrentUser(data.username);
      setToken(data.token);
      setUsername("");
      setPassword("");
      setAuthMessage("");
    } catch {
      setAuthMessage("Cannot connect to the backend.");
    }
  }

  async function handleSend(event) {
    event.preventDefault();

    const text = newMessage.trim();

    if (!text || !selectedUser) return;

    setMessageError("");

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify({
          sender: currentUser,
          receiver: selectedUser,
          text,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        setMessageError(
          typeof data === "string" ? data : "Message could not be sent."
        );
        return;
      }

      if (data && typeof data === "object") {
        knownMessageIds.current.add(messageKey(data));
        setMessages((oldMessages) => sortMessages([...oldMessages, data]));
      }

      setNewMessage("");
    } catch {
      setMessageError("Message could not be sent.");
    }
  }

  async function deleteMessage(id) {
    try {
      const response = await fetch(`${API_URL}/messages/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        setMessageError("Message could not be deleted.");
        return;
      }

      setMessages((oldMessages) =>
        oldMessages.filter((message) => String(message.id) !== String(id))
      );
    } catch {
      setMessageError("Message could not be deleted.");
    }
  }

  async function enableAlerts() {
    if (!("Notification" in window)) {
      showPopup("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === "granted");

    showPopup(
      permission === "granted"
        ? "Notifications enabled."
        : "Notifications were not allowed."
    );
  }

  function chooseUser(user) {
    setSelectedUser(user);

    setUnreadCounts((oldCounts) => ({
      ...oldCounts,
      [user]: 0,
    }));
  }

  function logout() {
    localStorage.removeItem("connectChatUser");
    localStorage.removeItem("connectChatToken");

    setCurrentUser("");
    setToken("");
    setUsers([]);
    setSelectedUser("");
    setMessages([]);
    setUnreadCounts({});
    setAuthMode("login");
  }

  if (!currentUser || !token) {
    return (
      <main className="auth-page">
        <form className="auth-card" onSubmit={handleAuth}>
          <h1>ConnectChat</h1>
          <p>
            {authMode === "register"
              ? "Create your account"
              : "Log in to continue"}
          </p>

          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            autoComplete="username"
          />

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete={
              authMode === "register" ? "new-password" : "current-password"
            }
          />

          <button type="submit">
            {authMode === "register" ? "Register" : "Login"}
          </button>

          {authMessage && <p className="error-message">{authMessage}</p>}

          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setAuthMode(authMode === "register" ? "login" : "register");
              setAuthMessage("");
            }}
          >
            {authMode === "register"
              ? "Already have an account? Login"
              : "Need an account? Register"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="chat-app">
      <aside className="sidebar">
        <h1>ConnectChat</h1>
        <p>Logged in as {currentUser}</p>

        <section className="user-list">
          {users.map((user) => {
            const unread = unreadCounts[user] || 0;

            return (
              <button
                type="button"
                key={user}
                className={`user-item ${
                  sameUser(user, selectedUser) ? "selected-user" : ""
                }`}
                onClick={() => chooseUser(user)}
              >
                <span className="avatar">
                  {user.charAt(0).toUpperCase()}
                </span>

                <span className="user-details">
                  <strong>{user}</strong>
                  <small>Online</small>
                </span>

                {unread > 0 && <span className="unread-badge">{unread}</span>}
              </button>
            );
          })}
        </section>

        <button type="button" className="logout-button" onClick={logout}>
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
                <small>Online</small>
              </div>
            </>
          ) : (
            <h2>Select a user</h2>
          )}

          <button
            type="button"
            className="alerts-button"
            onClick={enableAlerts}
          >
            {alertsEnabled ? "Alerts enabled" : "Enable alerts"}
          </button>
        </header>

        <section className="messages-area">
          {popup && <div className="message-popup">{popup}</div>}

          {!selectedUser && <p>Select a user to start chatting.</p>}

          {selectedUser && messages.length === 0 && (
            <p>No messages yet.</p>
          )}

          {messages.map((message) => {
            const isMine = sameUser(message.sender, currentUser);

            return (
              <article
                key={messageKey(message)}
                className={`message ${
                  isMine ? "my-message" : "other-message"
                }`}
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

          <div ref={messagesEndRef} />
        </section>

        {messageError && <p className="error-message">{messageError}</p>}

        <form className="message-form" onSubmit={handleSend}>
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
