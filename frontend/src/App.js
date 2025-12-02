import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateGroup from './pages/CreateGroup';
import GroupView from './pages/GroupView';
import GroupSettings from './pages/GroupSettings';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import PrivateRoute from './components/PrivateRoute';
import { ToastProvider } from './components/Toast';
import { setToken } from './api';

// Initialize token on app load
const token = localStorage.getItem('token');
if (token) {
  setToken(token);
  console.log('Token initialized on app load');
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/dashboard" element={<PrivateRoute><Dashboard/></PrivateRoute>} />
          <Route path="/groups/create" element={<PrivateRoute><CreateGroup/></PrivateRoute>} />
          <Route path="/groups/:id" element={<PrivateRoute><GroupView/></PrivateRoute>} />
          <Route path="/groups/:id/settings" element={<PrivateRoute><GroupSettings/></PrivateRoute>} />
          <Route path="/notifications" element={<PrivateRoute><Notifications/></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile/></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
