package com.connectchat.chat_backend.repository;

import com.connectchat.chat_backend.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {

    @Query("""
            SELECT m FROM Message m
            WHERE (m.sender = :firstUser AND m.receiver = :secondUser)
               OR (m.sender = :secondUser AND m.receiver = :firstUser)
            ORDER BY m.sentAt ASC
            """)
    List<Message> findConversation(
            @Param("firstUser") String firstUser,
            @Param("secondUser") String secondUser
    );
}
