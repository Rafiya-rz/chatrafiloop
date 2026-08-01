package com.connectchat.chat_backend;

import com.connectchat.chat_backend.entity.Message;
import com.connectchat.chat_backend.repository.MessageRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/messages")
public class MessageController {

    private final MessageRepository messageRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageController(
            MessageRepository messageRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.messageRepository = messageRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @PostMapping
    public ResponseEntity<?> sendMessage(
            @RequestBody Message message,
            Authentication authentication
    ) {
        if (authentication == null) {
            return ResponseEntity.status(401).body("Please log in.");
        }

        if (message.getReceiver() == null ||
                message.getReceiver().isBlank() ||
                message.getText() == null ||
                message.getText().isBlank()) {
            return ResponseEntity.badRequest()
                    .body("Receiver and message text are required.");
        }

        message.setSender(authentication.getName());
        message.setSentAt(Instant.now());

        Message savedMessage = messageRepository.save(message);

        messagingTemplate.convertAndSend(
                "/topic/messages",
                savedMessage
        );

        return ResponseEntity.ok(savedMessage);
    }

    @GetMapping("/chat")
    public ResponseEntity<?> getChatMessages(
            @RequestParam("firstUser") String firstUser,
            @RequestParam("secondUser") String secondUser,
            Authentication authentication
    ) {
        if (authentication == null) {
            return ResponseEntity.status(401).body("Please log in.");
        }

        String loggedInUser = authentication.getName();

        if (!firstUser.equals(loggedInUser) &&
                !secondUser.equals(loggedInUser)) {
            return ResponseEntity.status(403)
                    .body("You cannot view another user's chat.");
        }

        List<Message> messages =
                messageRepository.findConversation(firstUser, secondUser);

        return ResponseEntity.ok(messages);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteMessage(
            @PathVariable Long id,
            Authentication authentication
    ) {
        if (authentication == null) {
            return ResponseEntity.status(401).body("Please log in.");
        }

        Message message = messageRepository.findById(id).orElse(null);

        if (message == null) {
            return ResponseEntity.notFound().build();
        }

        if (!message.getSender().equals(authentication.getName())) {
            return ResponseEntity.status(403)
                    .body("You can delete only your own messages.");
        }

        messageRepository.deleteById(id);
        messagingTemplate.convertAndSend("/topic/deleted-messages", id);

        return ResponseEntity.noContent().build();
    }
}