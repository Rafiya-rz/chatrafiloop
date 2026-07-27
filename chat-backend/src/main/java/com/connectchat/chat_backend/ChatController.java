package com.connectchat.chat_backend;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ChatController {

    @GetMapping("/")
    public String home() {
        return "Chat Backend is running successfully!";
    }
}