const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store current votes by color: { group: { color: option } }
const votes = {};
// Store user info: { oderId: { color: '#...' } }
const users = {};

function getUsersObject() {
    return users;
}

function getColorUsers() {
    // Map colors to socket IDs for display
    const colorMap = {};
    Object.entries(users).forEach(([oderId, data]) => {
        if (data.color) {
            colorMap[data.color] = oderId;
        }
    });
    return colorMap;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initialize user without color (will be set when they pick)
    users[socket.id] = { color: null };

    // Notify everyone about user count
    io.emit('user-count', Object.keys(users).length);

    // Handle color selection
    socket.on('set-color', (data) => {
        const color = data.color;

        // Remove any other user with this color (take over the color)
        Object.keys(users).forEach(otherId => {
            if (users[otherId].color === color && otherId !== socket.id) {
                users[otherId].color = null;
            }
        });

        users[socket.id] = { color: color };
        console.log(`User ${socket.id} picked color: ${color}`);

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
        const userColor = users[socket.id]?.color;
        if (!userColor) return; // Must have a color to vote

        // Store the vote by COLOR: votes[group][color] = option
        if (!votes[data.group]) {
            votes[data.group] = {};
        }

        // Set this color's vote for this group
        if (data.option) {
            votes[data.group][userColor] = data.option;
        } else {
            // Deselecting
            delete votes[data.group][userColor];
        }

        // Broadcast to all users including sender
        io.emit('vote-update', {
            group: data.group,
            option: data.option,
            color: userColor,
            allVotes: votes,
            users: getUsersObject()
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Don't remove votes - they persist by color!
        // Just remove the user session
        delete users[socket.id];

        io.emit('user-count', Object.keys(users).length);
        io.emit('users-update', getUsersObject());
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
