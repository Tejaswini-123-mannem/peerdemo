require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const cycleRoutes = require('./routes/cycles');
const invitationRoutes = require('./routes/invitations');
const disputeRoutes = require('./routes/disputes');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/peer2loan');

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/cycles', cycleRoutes);
app.use('/api', invitationRoutes);
app.use('/api/disputes', disputeRoutes);

// quick health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
