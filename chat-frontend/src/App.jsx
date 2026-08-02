import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8081"
).replace(/\/$/, "");

const normalizeName = (value = "") => value.trim().toLowerCase();

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortMessages(list) {
  return [...list].sort((first, second) => {
    const firstTime = new Date(first.sentAt || 0).getTime();
    const secondTime = new Date(second.sentAt || 0).getTime();

    return firstTime - secondTime;
  });
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(
    () => localStorage.getItem("connectChatUser") || ""
  );

  const [authMode, setAuthMode] = useState("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [messageError, setMessageError] = useState("");

  const [unreadCounts, setUnreadCounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("connectChatUnread") || "{}");
    } catch {
      return {};
    }
  });

  const [toast, setToast] = useState(null);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(
    () =>
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
  );

  const knownMessageIds = useRef(new Set());
  const inboxReady = useRef(false);
  const selectedUserRef = useRef("");
  const toastTimer = useRef(null);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    localStorage.setItem(
      "connectChatUnread",
      JSON.stringify(unreadCounts)
    );
  }, [unreadCounts]);

  useEffect(() => {
    return () => clearTimeout(toastTimer.current);
  }, []);

  function getHeaders(includeJson = false) {
    const token = localStorage.getItem("connectChatToken");

    return {
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  function logout() {
    localStorage.removeItem("connectChatUser");
    localStorage.removeItem("connectChatToken");
    localStorage.removeItem("connectChatUnread");

    setCurrentUser("");
    setUsers([]);
    setSelectedUser("");
    setMessages([]);
    setUnreadCounts({});
    setToast(null);

    knownMessageIds.current = new Set();
    inboxReady.current = false;
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, options);

    if (response.status === 401 || response.status === 403) {
      logout();
      throw new Error("Your login session ended. Please log in again.");
    }

    return response;
  }

  function showNewMessageAlert(sender, text) {
    clearTimeout(toastTimer.current);

    setToast({
      sender,
      text,
    });

    toastTimer.current = setTimeout(() => {
      setToast(null);
    }, 5000);

    if (
      document.visibilityState === "hidden" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(`New message from ${sender}`, {
        body: text,
      });
    }
  }

  async function loadUsers() {
    const response = await apiFetch("/users", {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error("Could not load users.");
    }

    const data = await response.json();

    const otherUsers = data.filter(
      (user) => normalizeName(user) !== normalizeName(currentUser)
    );

    setUsers(otherUsers);

    setSelectedUser((previousUser) => {
      if (
        previousUser &&
        otherUsers.some(
          (user) =>
            normalizeName(user) === normalizeName(previousUser)
        )
      ) {
        return previousUser;
      }

      return otherUsers[0] || "";
    });
  }

  async function loadConversation(user = selectedUser) {
    if (!currentUser || !user) {
      setMessages([]);
      return;
    }

    const response = await apiFetch(
      `/messages/chat?firstUser=${encodeURIComponent(
        currentUser
      )}&secondUser=${encodeURIComponent(user)}`,
      {
        headers: getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error("Could not load messages.");
    }

    const data = await response.json();

    data.forEach((message) => {
      knownMessageIds.current.add(message.id);
    });

    setMessages(sortMessages(data));
  }

  async function checkForNewMessages() {
    if (!currentUser) {
      return;
    }

    try {
      const response = await apiFetch("/messages", {
        headers: getHeaders(),
      });

      if (!response.ok) {
        return;
      }

      const allMessages = await response.json();

      if (!inboxReady.current) {
        allMessages.forEach((message) => {
          knownMessageIds.current.add(message.id);
        });

        inboxReady.current = true;
        return;
      }

      const newIncomingMessages = allMessages.filter((message) => {
        const isNew = !knownMessageIds.current.has(message.id);

        knownMessageIds.current.add(message.id);

        return (
          isNew &&
          normalizeName(message.receiver) ===
            normalizeName(currentUser) &&
          normalizeName(message.sender) !==
            normalizeName(currentUser)
        );
      });

      if (newIncomingMessages.length === 0) {
        return;
      }

      setUnreadCounts((previousCounts) => {
        const nextCounts = { ...previousCounts };

        newIncomingMessages.forEach((message) => {
          const senderKey = normalizeName(message.sender);

          if (
            senderKey !== normalizeName(selectedUserRef.current)
          ) {
            nextCounts[senderKey] = (nextCounts[senderKey] || 0) + 1;
          }
        });

        return nextCounts;
      });

      const lastMessage =
        newIncomingMessages[newIncomingMessages.length - 1];

      showNewMessageAlert(lastMessage.sender, lastMessage.text);

      const selectedUserKey = normalizeName(selectedUserRef.current);

      if (
        newIncomingMessages.some(
          (message) =>
            normalizeName(message.sender) === selectedUserKey
        )
      ) {
        loadConversation(selectedUserRef.current).catch(() => {});
      }
    } catch {
      // The next check will try again.
    }
  }

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    loadUsers().catch((error) => {
      setMessageError(error.message);
    });

    checkForNewMessages();

    const intervalId = setInterval(checkForNewMessages, 2000);

    return () => clearInterval(intervalId);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedUser) {
      return;
    }

    loadConversation().catch((error) => {
      setMessageError(error.message);
    });
  }, [currentUser, selectedUser]);

  async function handleAuth(event) {
    event.preventDefault();

    setAuthError("");
    setAuthMessage("");

    if (!username.trim() || !password.trim()) {
      setAuthError("Enter both username and password.");
      return;
    }

    try {
      const endpoint =
        authMode === "register" ? "/users/register" : "/users/login";

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

      if (authMode === "register") {
        const text = await response.text();

        if (!response.ok) {
          throw new Error(text || "Registration failed.");
        }

        setAuthMessage(
          "Registration successful. Now click Login and use the same details."
        );
        setAuthMode("login");
        setPassword("");
        return;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Wrong username or password."
        );
      }

      localStorage.setItem("connectChatUser", data.username);
      localStorage.setItem("connectChatToken", data.token);

      knownMessageIds.current = new Set();
      inboxReady.current = false;

      setCurrentUser(data.username);
      setUsername("");
      setPassword("");
    } catch (error) {
      setAuthError(error.message || "Cannot connect to the backend.");
    }
  }

  function chooseUser(user) {
    setSelectedUser(user);
    setMessageError("");

    setUnreadCounts((previousCounts) => {
      const nextCounts = { ...previousCounts };
      delete nextCounts[normalizeName(user)];
      return nextCounts;
    });
  }

  async function sendMessage(event) {
    event.preventDefault();

    const text = newMessage.trim();

    if (!text || !selectedUser) {
      return;
    }

    setMessageError("");

    try {
      const response = await apiFetch("/messages", {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify({
          sender: currentUser,
          receiver: selectedUser,
          text,
        }),
      });

      if (!response.ok) {
        throw new Error("Message could not be sent.");
      }

      const savedMessage = await response.json();

      knownMessageIds.current.add(savedMessage.id);

      setMessages((previousMessages) =>
        sortMessages([
          ...previousMessages.filter(
            (message) => message.id !== savedMessage.id
          ),
          savedMessage,
        ])
      );

      setNewMessage("");
    } catch (error) {
      setMessageError(error.message);
    }
  }

  async function deleteMessage(messageId) {
    if (!window.confirm("Delete this message?")) {
      return;
    }

    setMessageError("");

    try {
      const response = await apiFetch(`/messages/${messageId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error("Message could not be deleted.");
      }

      setMessages((previousMessages) =>
        previousMessages.filter(
          (message) => message.id !== messageId
        )
      );
    } catch (error) {
      setMessageError(error.message);
    }
  }

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) {
      setMessageError("This browser does not support pop-up alerts.");
      return;
    }

    const permission = await Notification.requestPermission();

    setBrowserAlertsEnabled(permission === "granted");

    if (permission !== "granted") {
      setMessageError(
        "Notification permission was not allowed."
      );
    }
  }

  if (!currentUser) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>ConnectChat</h1>

          <p>
            {authMode === "register"
              ? "Create your account"
              : "Log in to continue"}
          </p>

          <form onSubmit={handleAuth}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />

            <button type="submit">
              {authMode === "register" ? "Register" : "Login"}
            </button>
          </form>

          {authMessage && (
            <p className="success-message">{authMessage}</p>
          )}

          {authError && (
            <p className="error-message">{authError}</p>
          )}

          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setAuthMode(
                authMode === "register" ? "login" : "register"
              );
              setAuthError("");
              setAuthMessage("");
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
        <h1>ConnectChat</h1>
        <p>Logged in as {currentUser}</p>

        <section className="user-list">
          {users.length === 0 ? (
            <p>No other users yet.</p>
          ) : (
            users.map((user) => {
              const unreadCount =
                unreadCounts[normalizeName(user)] || 0;

              return (
                <button
                  type="button"
                  key={user}
                  className={`user-item ${
                    normalizeName(user) ===
                    normalizeName(selectedUser)
                      ? "selected-user"
                      : ""
                  }`}
                  onClick={() => chooseUser(user)}
                >
                  <span className="avatar">
                    {user.charAt(0).toUpperCase()}
                  </span>

                  <span>
                    <strong>{user}</strong>
                    <small>Registered user</small>
                  </span>

                  {unreadCount > 0 && (
                    <span className="unread-badge">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </section>

        <button
          type="button"
          className="logout-button"
          onClick={logout}
        >
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

              <button
                type="button"
                className="alerts-button"
                onClick={enableBrowserAlerts}
              >
                {browserAlertsEnabled
                  ? "Alerts on"
                  : "Enable alerts"}
              </button>
            </>
          ) : (
            <h2>Select a user to begin</h2>
          )}
        </header>

        <section className="messages-area">
          {!selectedUser ? (
            <p>Select a user from the left side.</p>
          ) : messages.length === 0 ? (
            <p>No messages yet.</p>
          ) : (
            messages.map((message) => {
              const isMine =
                normalizeName(message.sender) ===
                normalizeName(currentUser);

              return (
                <article
                  key={message.id}
                  className={
                    isMine
                      ? "message my-message"
                      : "message other-message"
                  }
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
            })
          )}
        </section>

        {messageError && (
          <p className="error-message">{messageError}</p>
        )}

        <form className="message-form" onSubmit={sendMessage}>
          <input
            type="text"
            placeholder={
              selectedUser
                ? "Type a message..."
                : "Select a user first"
            }
            value={newMessage}
            onChange={(event) =>
              setNewMessage(event.target.value)
            }
            disabled={!selectedUser}
          />

          <button type="submit" disabled={!selectedUser}>
            Send
          </button>
        </form>
      </section>

      {toast && (
        <button
          type="button"
          className="message-toast"
          onClick={() => chooseUser(toast.sender)}
        >
          <strong>New message from {toast.sender}</strong>
          <span>{toast.text}</span>
        </button>
      )}
    </main>
  );
}