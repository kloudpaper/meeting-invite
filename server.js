const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();  

require('dotenv').config();

// allow your Pages site to call the API
app.use(cors({
  origin: ['https://kloudpaper.github.io'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// connect to Mongo
mongoose.connect(process.env.MONGO_URL, {
  dbName: process.env.MONGO_DB || 'meeting_invite'
}).then(() => console.log('✅ Mongo connected'))
  .catch(err => console.error('❌ Mongo error:', err));

// define a schema/model
const Registration = mongoose.model('Registration', new mongoose.Schema({
  ts: { type: Date, default: Date.now },
  name: String,
  email: String,
  position: String,
  orgType: String,
  orgName: String,
  optIn: Boolean,
  meeting: {
    title: String,
    description: String,
    startsAt: String,
    endsAt: String,
    joinUrl: String
  }
}, { versionKey: false }));



// parse application/json
// Configure transport via env vars for safety.
// Example: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true', // true for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Helper: convert ISO date to ICS format YYYYMMDDTHHMMSSZ
function toICSDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2,'0');
  const YYYY = d.getUTCFullYear();
  const MM = pad(d.getUTCMonth()+1);
  const DD = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${YYYY}${MM}${DD}T${hh}${mm}${ss}Z`;
}

app.post('/register', async (req, res) => {
  try {
    const { name, email, notes, meeting } = req.body;
    if (!name || !email) return res.status(400).send('Missing name or email');

    // meeting metadata fallback
    const meet = Object.assign({
      title: "Online Meeting",
      description: "Meeting",
      startsAt: new Date(Date.now() + 3*24*3600*1000).toISOString(), // default in 3 days
      endsAt: new Date(Date.now() + 3*24*3600*1000 + 60*60*1000).toISOString(), // +1h
      joinUrl: "https://example.com/meeting-link"
    }, meeting || {});

    const uid = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random());
    const dtstamp = toICSDate(new Date().toISOString());
    const dtstart = toICSDate(meet.startsAt);
    const dtend = toICSDate(meet.endsAt);

    // Build minimal ICS content (REQUEST method invites calendar clients to accept)
    const ics =
`BEGIN:VCALENDAR
PRODID:-//Your Company//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${escapeICSText(meet.title)}
DESCRIPTION:${escapeICSText(meet.description + "\\n\\nNotes from registrant: " + (notes || ''))}
LOCATION:${escapeICSText(meet.joinUrl)}
STATUS:CONFIRMED
SEQUENCE:0
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

    // Prepare mail
    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: `Invitation: ${meet.title}`,
      text: `Hi ${name},\n\nYou are invited to: ${meet.title}\nWhen: ${meet.startsAt}\nJoin: ${meet.joinUrl}\n\nNotes: ${notes || ''}\n\nThis email includes an .ics calendar invite you can add to your calendar.`,
      html: `<p>Hi ${escapeHtml(name)},</p>
             <p>You are invited to <strong>${escapeHtml(meet.title)}</strong>.</p>
             <p><strong>When:</strong> ${escapeHtml(meet.startsAt)} — ${escapeHtml(meet.endsAt)}</p>
             <p><a href="${escapeHtml(meet.joinUrl)}">Click to join meeting</a></p>
             <p>Notes: ${escapeHtml(notes || '')}</p>
             <p>The calendar invite is attached.</p>`,
      attachments: [
        {
          filename: 'invite.ics',
          content: ics,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST'
        }
      ]
    };

    // Send
    await transporter.sendMail(mailOptions);

    // Save to Mongo (after email was sent successfully)
    await Registration.create({
      name,
      email,
      notes: notes || '',
      meeting: {
        title: meet.title,
        description: meet.description,
        startsAt: meet.startsAt,
        endsAt: meet.endsAt,
        joinUrl: meet.joinUrl
      }
    });
    // Optionally: save to DB or log registration
    console.log('Registered:', { name, email, meeting: meet });

    res.json({ ok: true, message: 'Invitation sent' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error: ' + String(err.message || err));
  }
});

// small helper to escape newline/characters for ICS
function escapeICSText(s = '') {
  return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// List as JSON
app.get('/registrations.json', async (_req, res) => {
  const list = await Registration.find().sort({ ts: -1 }).lean();
  res.json(list);
});

// Export as CSV (Excel-friendly)
app.get('/registrations.csv', async (_req, res) => {
  const list = await Registration.find().sort({ ts: -1 }).lean();

  const headers = ['ts','name','email','position','orgType','orgName','optIn',
                   'meeting.title','meeting.description','meeting.startsAt','meeting.endsAt','meeting.joinUrl'];

  const toCell = (obj, path) => {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) cur = (cur && cur[p] !== undefined) ? cur[p] : '';
    const val = cur == null ? '' : String(cur);
    return /[",\n]/.test(val) ? `"${val.replace(/"/g,'""')}"` : val;
  };

  const rows = [
    headers.join(','),
    ...list.map(r => headers.map(h => toCell(r, h)).join(','))
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send(rows);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});
app.get('/health/db', async (_req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
