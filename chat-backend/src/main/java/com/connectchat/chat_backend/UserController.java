package com.connectchat.chat_backend;

import com.connectchat.chat_backend.entity.User;
import com.connectchat.chat_backend.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/users")
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public UserController(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @PostMapping("/register")
    public ResponseEntity<String> registerUser(@RequestBody User user) {
        if (userRepository.existsByUsername(user.getUsername())) {
            return ResponseEntity.badRequest().body("Username already exists.");
        }

        user.setPassword(passwordEncoder.encode(user.getPassword()));
        userRepository.save(user);

        return ResponseEntity.ok("Registration successful.");
    }

    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@RequestBody User user) {
        return userRepository.findByUsername(user.getUsername())
                .filter(foundUser ->
                        passwordEncoder.matches(user.getPassword(), foundUser.getPassword())
                )
                .map(foundUser -> ResponseEntity.ok(Map.of(
                        "token", jwtService.createToken(foundUser.getUsername()),
                        "username", foundUser.getUsername()
                )))
                .orElseGet(() -> ResponseEntity.status(401)
                        .body(Map.of("error", "Wrong username or password.")));
    }

    @GetMapping
    public List<String> getAllUsers() {
        return userRepository.findAll()
                .stream()
                .map(User::getUsername)
                .toList();
    }
}
