package com.connectchat.chat_backend;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Date;

@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String jwtSecret;

    private Algorithm algorithm() {
        return Algorithm.HMAC256(jwtSecret);
    }

    public String createToken(String username) {
        return JWT.create()
                .withSubject(username)
                .withIssuedAt(new Date())
                .withExpiresAt(new Date(System.currentTimeMillis() + 86_400_000L))
                .sign(algorithm());
    }

    public String getUsernameFromToken(String token) {
        return JWT.require(algorithm())
                .build()
                .verify(token)
                .getSubject();
    }
}