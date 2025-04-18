// server.js
const express    = require('express');
const bodyParser = require('body-parser');
const session    = require('express-session');
const ipn        = require('paypal-ipn');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const path       = require('path');
const db         = require('./db'); // see next section

const app = express();

// parse form-encoded bodies (PayPal IPN + login forms)
app.use(bodyParser.urlencoded({ extended: false }));

// sessions for login
app.use(session({
  secret: 'a-very-secret-key',
  resave: false,
  saveUninitialized: false
}));

// Serve static HTML/JS/CSS from /public
app.use(express.static(path.join(__dirname, 'public')));

// IPN listener
app.post('/ipn', (req, res) => {
  // 1) Reply quickly to PayPal
  res.status(200).end();

  // 2) Verify notification
  ipn.verify(req.body, { allow_sandbox: false }, async (err, msg) => {
    if (err) {
      console.error('IPN error:', err);
      return;
    }
    if (msg === 'VERIFIED') {
      const d = req.body;
      // 3) Check payment details
      if (
        d.payment_status === 'Completed' &&
        d.mc_gross       === '4.99' &&
        d.mc_currency   === 'EUR' &&
        d.receiver_email=== 'YOUR_PAYPAL_EMAIL@example.com'
      ) {
        try {
          // 4) Generate username & password
          const username = 'joe_' + crypto.randomBytes(3).toString('hex');
          const rawPwd   = crypto.randomBytes(4).toString('hex');
          const hash     = await db.hashPassword(rawPwd);

          // 5) Store in DB
          await db.query(
            'INSERT INTO users (username,password_hash,email) VALUES (?,?,?)',
            [username, hash, d.payer_email]
          );

          // 6) Email credentials
          const transporter = nodemailer.createTransport({
            host: 'smtp.example.com',
            port: 587,
            secure: false,
            auth: {
              user: 'smtp-user',
              pass: 'smtp-pass'
            }
          });

          await transporter.sendMail({
            from: '"OnlyJoe" <no-reply@onlyjoevids.com>',
            to:   d.payer_email,
            subject: 'Your OnlyJoe Login',
            text: `
Hi there!

Thanks for subscribing to OnlyJoe Exclusive.  
You can now log in at:
  https://onlyjoevids.com/exclusive

Username: ${username}
Password: ${rawPwd}

Enjoy the vids!
`
          });
        } catch (e) {
          console.error('Error handling new subscriber:', e);
        }
      } else {
        console.warn('Payment didn’t match criteria:', d);
      }
    } else {
      console.warn('Invalid IPN:', req.body);
    }
  });
});

// Show exclusive page (if logged in)
app.get('/exclusive', (req, res) => {
  if (!req.session.userId) {
    return res.sendFile(path.join(__dirname, 'public/exclusive-login.html'));
  }
  res.sendFile(path.join(__dirname, 'public/exclusive.html'));
});

// Handle login form
app.post('/exclusive/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.getUserByUsername(username);
  if (!user) return res.redirect('/exclusive?error=1');

  const ok = await db.verifyPassword(password, user.password_hash);
  if (!ok) return res.redirect('/exclusive?error=1');

  req.session.userId = user.id;
  res.redirect('/exclusive');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
