const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const users = {};
const moodGroups = {};
const moodCounts = {};

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('set username', (username) => {
        users[socket.id] = { username, mood: null, chatGroup: null };
        updateCounts();
    });

    socket.on('enter mood', (mood) => {
        if (users[socket.id]) {
            users[socket.id].mood = mood;

            if (!moodGroups[mood]) {
                moodGroups[mood] = [];
            }

            const availableGroup = moodGroups[mood].find(group => group.length < 2);

            if (availableGroup) {
                availableGroup.push(socket.id);
                users[socket.id].chatGroup = availableGroup;
                if (availableGroup.length === 2) {
                    const otherUserId = availableGroup.find(id => id !== socket.id);
                    io.to(socket.id).emit('matched', { group: availableGroup });
                    io.to(otherUserId).emit('matched', { group: availableGroup });
                }
            } else {
                moodGroups[mood].push([socket.id]);
                users[socket.id].chatGroup = moodGroups[mood][moodGroups[mood].length - 1];
            }

            if (!moodCounts[mood]) {
                moodCounts[mood] = 0;
            }
            moodCounts[mood]++;
            updateCounts();
        }
    });

    socket.on('send message', ({ message }) => {
        const { chatGroup } = users[socket.id];
        if (chatGroup && chatGroup.length === 2) {
            const otherUserId = chatGroup.find(id => id !== socket.id);
            if (otherUserId) {
                io.to(otherUserId).emit('receive message', { from: users[socket.id].username, message });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const { mood, chatGroup } = users[socket.id] || {};
        if (chatGroup) {
            chatGroup.splice(chatGroup.indexOf(socket.id), 1);
            const otherUserId = chatGroup[0];
            if (otherUserId) {
                io.to(otherUserId).emit('user left');
            }
            if (moodGroups[mood]) {
                moodGroups[mood] = moodGroups[mood].filter(group => group.length > 0);
                if (moodGroups[mood].length === 0) {
                    delete moodGroups[mood];
                }
            }
        }
        if (moodCounts[mood]) {
            moodCounts[mood]--;
            if (moodCounts[mood] === 0) {
                delete moodCounts[mood];
            }
        }
        delete users[socket.id];
        updateCounts();
    });

    function updateCounts() {
        const totalUsers = Object.keys(users).length;
        io.emit('user counts', { totalUsers, moodCounts });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
