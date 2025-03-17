const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const socketHandler = require('./sockets/socketHandler');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const groupRoutes = require('./routes/groupRoutes');
const messageRoutes = require('./routes/messageRoutes');
const fileRoutes = require('./routes/fileRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use((req, res, next) => {
    req.io = io;
    next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
mongoose.connect('mongodb+srv://chats:chats@cluster0.g7jsw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err.message));

// Routes
app.get('/test', (req, res) => {
    try {
        console.log('Test endpoint hit');
        res.status(200).json({ status: 'success', message: 'Server is running' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', groupRoutes);
app.use('/api', messageRoutes);
app.use('/api', fileRoutes);

// Socket.IO Handling
socketHandler(io);

// Start Server
const PORT = process.env.PORT || 3001;

const startServer = async () => {
    try {
        for (let port = PORT; port < PORT + 10; port++) {
            try {
                await new Promise((resolve, reject) => {
                    server.listen(port)
                        .once('listening', () => {
                            console.log(`Server running on port ${port}`);
                            console.log(`Test endpoint: http://localhost:${port}/test`);
                            resolve();
                        })
                        .once('error', (err) => {
                            if (err.code === 'EADDRINUSE') {
                                console.log(`Port ${port} is busy, trying next port...`);
                                reject(err);
                            } else {
                                reject(err);
                            }
                        });
                });
                break;
            } catch (err) {
                if (port === PORT + 9) {
                    throw new Error('No available ports found');
                }
                continue;
            }
        }
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
});