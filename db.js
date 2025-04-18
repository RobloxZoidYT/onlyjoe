// db.js — replace with your real DB + hashing logic
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcrypt');

const pool = mysql.createPool({
  host:     'localhost',
  user:     'dbuser',
  password: 'dbpass',
  database: 'onlyjoe'
});

module.exports = {
  query: (...args) => pool.query(...args),

  hashPassword: (plaintext) => bcrypt.hash(plaintext, 10),

  verifyPassword: (plaintext, hash) => bcrypt.compare(plaintext, hash),

  getUserByUsername: async (username) => {
    const [rows] = await pool.query(
      'SELECT id, password_hash FROM users WHERE username = ?',
      [username]
    );
    return rows[0];
  }
};
