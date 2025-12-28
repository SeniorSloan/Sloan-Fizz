const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store current votes: { group: { oderId: option } }
const votes = {};
// Store user info: { oderId: { color: '#...' } }
const users = {};

function getUsersObject() {
    return users;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initialize user without color (will be set when they pick)
    users[socket.id] = { color: null };

    // Notify everyone about user count
    io.emit('user-count', Object.keys(users).length);

    // Handle color selection
    socket.on('set-color', (data) => {
        users[socket.id] = { color: data.color };
        console.log(`User ${socket.id} picked color: ${data.color}`);

        // Broadcast updated users to everyone
        io.emit('users-update', getUsersObject());

        // Send current votes to this user
        socket.emit('sync-votes', votes);
    });

    // Handle request for votes (used after users-update)
    socket.on('request-votes', () => {
        socket.emit('sync-votes', votes);
    });

    // Handle vote events
    socket.on('vote', (data) => {
        // Store the vote: votes[group][oderId] = option
        if (!votes[data.group]) {
            votes[data.group] = {};
        }

        // Set this user's vote for this group
        if (data.option) {
            votes[data.group][socket.id] = data.option;
        } else {
            // Deselecting
            delete votes[data.group][socket.id];
        }

        // Broadcast to all users including sender
        io.emit('vote-update', {
            group: data.group,
            option: data.option,
            oderId: socket.id,
            allVotes: votes,
            users: getUsersObject()
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove user's votes from all groups
        Object.keys(votes).forEach(group => {
            delete votes[group][socket.id];
        });

        // Remove user
        delete users[socket.id];

        io.emit('user-count', Object.keys(users).length);
        io.emit('users-update', getUsersObject());
        io.emit('sync-votes', votes);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
