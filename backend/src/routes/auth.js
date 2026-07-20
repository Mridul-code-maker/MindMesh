const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 1. SIGNUP ENDPOINT
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, role = 'Member' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.'
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email is already registered.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        name: name.trim(),
        role
      }
    });

    // Write Activity Log
    await prisma.activityLog.create({
      data: {
        userId: newUser.id,
        action: 'Account Created',
        details: `Registered account for ${newUser.name} (${newUser.role})`
      }
    });

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.'
    });

  } catch (err) {
    next(err);
  }
});

// 2. LOGIN ENDPOINT
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid email or password.'
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid email or password.'
      });
    }

    // Sign Token
    const token = jwt.sign(
      { userId: user.id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Write Activity Log
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'User Login',
        details: `Logged in session for user ${user.name}`
      }
    });

    res.json({
      success: true,
      message: 'Authentication successful.',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
