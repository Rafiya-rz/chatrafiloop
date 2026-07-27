\# ConnectChat



A secure real-time full-stack chat application.



\## Features



\- User registration and login

\- BCrypt password encryption

\- JWT-based authentication

\- Real-time one-to-one messaging with WebSocket and STOMP

\- Message history stored in MySQL

\- Only the message sender can delete their own messages

\- Real-time message deletion

\- Responsive React chat interface



\## Technology Stack



\### Frontend



\- React

\- Vite

\- JavaScript

\- CSS

\- STOMP WebSocket client



\### Backend



\- Java 21

\- Spring Boot

\- Spring Security

\- Spring Data JPA

\- WebSocket / STOMP

\- JWT



\### Database



\- MySQL



\## Project Structure



```text

chatrafiloop

├── chat-backend

│   └── Spring Boot API

└── chat-frontend

&#x20;   └── React user interface

```



\## Run Locally



\### Backend



1\. Create a MySQL database named `chat\_db`.

2\. Copy `application.properties.example` to `application.properties`.

3\. Add your MySQL password and JWT secret.

4\. Run `ChatBackendApplication` in IntelliJ.

5\. Backend runs at `http://localhost:8081`.



\### Frontend



```bash

cd chat-frontend

npm install

npm run dev

```



Open `http://localhost:5173`.



\## Main API Endpoints



\- `POST /users/register`

\- `POST /users/login`

\- `GET /users`

\- `POST /messages`

\- `GET /messages/chat`

\- `DELETE /messages/{id}`



\## Future Improvements



\- Deploy online for mobile and friend access

\- Profile photos

\- Typing indicator

\- Image and file sharing

\- Group chat

\- Read receipts



