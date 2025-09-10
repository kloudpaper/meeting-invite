// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { v4: uuidv4 } = require('uuid');

const app = express();

/* =========================
   Configuración general
========================= */
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://kloudpaper.github.io')
  .split(',')
  .map(s => s.trim());

app.use(express.json());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // permitir curl/postman
    const ok = ALLOWED_ORIGINS.includes(origin);
    cb(ok ? null : new Error('CORS not allowed'), ok);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('/register', cors());

/* =========================
   Datos fijos de la reunión
========================= */
const MEETING = {
  title: 'Reunión de la sesión de cinética',
  dateText: 'Monday, 25 August from 5:00 to 6:00pm',
  timezone: 'America/Mexico_City',
  startISO: '2025-08-25T17:00:00-06:00', // 5:00pm local time
  endISO:   '2025-08-25T18:00:00-06:00', // 6:00pm local time
  joinUrl: 'https://meet.google.com/gsa-btnb-dmq',
  dialInfo: '(MX) +52 55 8421 0898 PIN: 496 952 841 6855#',
  morePhones: 'https://tel.meet/gsa-btnb-dmq?pin=4969528416855'
};

/* =========================
   Conexión MongoDB
========================= */
(async () => {
  try {
    const uri = process.env.MONGO_URL;
    const dbName = process.env.MONGO_DB || 'meeting_invite';
    if (!uri) {
      console.warn('[WARN] MONGO_URL no está definido. Los endpoints de DB no funcionarán.');
    } else {
      await mongoose.connect(uri, { dbName });
      console.log('[OK] Conectado a Mongo:', dbName);
    }
  } catch (err) {
    console.error('[ERROR] Conectando a Mongo:', err.message);
  }
})();

const RegistrationSchema = new mongoose.Schema({
  name: String,
  email: String,
  organization: String,
  role: String,
  phone: String,
  notes: String,
  consent: { type: Boolean, default: false },
  source: String,
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const Registration = mongoose.models.Registration || mongoose.model('Registration', RegistrationSchema);

/* =========================
   Template de correo HTML
========================= */
function emailHtml({ name }) {
  return `
/* =========================
   Conexión MongoDB
========================= */
(async () => {
  try {
    const uri = process.env.MONGO_URL;
    const dbName = process.env.MONGO_DB || 'meeting_invite';
    if (!uri) {
      console.warn('[WARN] MONGO_URL no está definido. Los endpoints de DB no funcionarán.');
    } else {
      await mongoose.connect(uri, { dbName });
      console.log('[OK] Conectado a Mongo:', dbName);
    }
  } catch (err) {
    console.error('[ERROR] Conectando a Mongo:', err.message);
  }
})();

const RegistrationSchema = new mongoose.Schema({
  name: String,
  email: String,
  organization: String,
  role: String,
  phone: String,
  notes: String,
  consent: { type: Boolean, default: false },
  source: String,
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const Registration = mongoose.models.Registration || mongoose.model('Registration', RegistrationSchema);

/* =========================
   Template de correo HTML
========================= */
function emailHtml({ name }) {
  return `
  <center style="width:100%; background-color:#f3f5f7;">
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">
      <tr>
        <td style="padding:20px 24px; background-color:#0b1220; text-align:left;">
          <a href="https://www.dikevichimie.com" target="_blank">
            <img src="https://raw.githubusercontent.com/kloudpaper/dikevi-chimie/main/imagotipo4.png" width="140" alt="Dikevi Chimie" style="display:block; border:0; outline:none; text-decoration:none; height:auto; max-width:100%;">
          </a>
          <div style="font-family:Arial, Helvetica, sans-serif; color:#e6edf3; font-size:12px; line-height:18px; margin-top:6px;">
            Potenciamos todos los procesos industriales con espectroscopía
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h2 style="font-family:Arial, Helvetica, sans-serif; color:#0b1220;">¡Hola ${name}!</h2>
          <p style="font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#333a45;">
            Te invitamos a la <strong>${MEETING.title}</strong>.<br>
            <strong>Fecha:</strong> ${MEETING.dateText}<br>
            <strong>Zona horaria:</strong> ${MEETING.timezone}
          </p>
          <p style="font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#333a45;">
            <strong>Google Meet:</strong><br>
            <a href="${MEETING.joinUrl}" style="color:#0b6ef6;">${MEETING.joinUrl}</a><br>
            <strong>Teléfono:</strong> ${MEETING.dialInfo}<br>
            <a href="${MEETING.morePhones}" style="color:#0b6ef6;">Más números de teléfono</a>
          </p>
          <p style="font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#333a45;">
            Se adjunta invitación para agregar al calendario.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 32px 24px; background:#f7f9fb;">
          <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#7a8594;">
             Dikevi Chimie Technologie. Todos los derechos reservados.
          </p>
        </td>
      </tr>
    </table>
  </center>
  `;
}

/* =========================
   Utilidades
========================= */
function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildIcsFromMeeting() {
  const nowUTC = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const fmtUTC = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const description =
    `Únete: ${MEETING.joinUrl}\\n` +
    `Teléfono: ${MEETING.dialInfo}\\n` +
    `Más teléfonos: ${MEETING.morePhones}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Meeting Invite//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uuidv4()}@meeting-invite`,
    `DTSTAMP:${nowUTC}`,
    `DTSTART:${fmtUTC(MEETING.startISO)}`,
    `DTEND:${fmtUTC(MEETING.endISO)}`,
    `SUMMARY:${escapeIcs(MEETING.title)}`,
    `LOCATION:${escapeIcs(MEETING.joinUrl)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.join('\r\n');
}

async function sendMail({ to, subject, html, icsBuffer }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;

  if (!host || !user || !pass) {
    throw new Error('SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const attachments = icsBuffer ? [{
    filename: 'webinar.ics',
    content: icsBuffer,
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
  }] : [];

  return transporter.sendMail({
    from,
    to,
    subject,
    html,
    attachments
  });
}

/* =========================
   Endpoints
========================= */
app.get('/', (_req, res) => {
  res.type('text/plain').send('Meeting Invite API is running.\nTry: GET /health, GET /registrations.json, GET /registrations.csv, POST /register');
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'meeting-invite',
    time: new Date().toISOString(),
    uptime_s: process.uptime()
  });
});

/* =========================
   Utilidades
========================= */
function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildIcsFromMeeting() {
  const nowUTC = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const fmtUTC = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const description =
    `Únete: ${MEETING.joinUrl}\\n` +
    `Teléfono: ${MEETING.dialInfo}\\n` +
    `Más teléfonos: ${MEETING.morePhones}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Meeting Invite//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uuidv4()}@meeting-invite`,
    `DTSTAMP:${nowUTC}`,
    `DTSTART:${fmtUTC(MEETING.startISO)}`,
    `DTEND:${fmtUTC(MEETING.endISO)}`,
    `SUMMARY:${escapeIcs(MEETING.title)}`,
    `LOCATION:${escapeIcs(MEETING.joinUrl)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.join('\r\n');
}

async function sendMail({ to, subject, html, icsBuffer }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;

  if (!host || !user || !pass) {
    throw new Error('SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const attachments = icsBuffer ? [{
    filename: 'webinar.ics',
    content: icsBuffer,
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
  }] : [];

  return transporter.sendMail({
    from,
    to,
    subject,
    html,
    attachments
  });
}

/* =========================
   Endpoints
========================= */
app.get('/', (_req, res) => {
  res.type('text/plain').send('Meeting Invite API is running.\nTry: GET /health, GET /registrations.json, GET /registrations.csv, POST /register');
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'meeting-invite',
    time: new Date().toISOString(),
    uptime_s: process.uptime()
  });
});

app.post('/register', async (req, res) => {
  try {
    const {
      name, email, organization, role, phone, notes, consent, source
    } = req.body || {};

    if (!email || !name) {
      return res.status(400).json({ ok: false, error: 'name y email son obligatorios.' });
    }

    // Guarda en Mongo si está conectado
    let saved = null;
    if (mongoose.connection.readyState === 1) {
      saved = await Registration.create({
        name, email, organization, role, phone, notes, consent: !!consent, source
      });
    }

    // ICS y correo
    const ics = buildIcsFromMeeting();
    await sendMail({
      to: email,
      subject: process.env.MAIL_SUBJECT || 'Confirmación de registro a la reunión',
      html: emailHtml({ name }),
      icsBuffer: Buffer.from(ics, 'utf8')
    });

    res.json({
      ok: true,
      saved: !!saved,
      message: 'Registro exitoso. Correo enviado con .ics.'
    });
  } catch (err) {
    console.error('[ERROR] /register:', err);
    res.status(500).json({ ok: false, error: 'Error en el servidor.' });
  }
});

// Descarga JSON (desde MongoDB)
app.get('/registrations.json', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ok: false, error: 'DB no disponible.' });
    }
    const items = await Registration.find({}).sort({ createdAt: -1 }).lean();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(items, null, 2));
  } catch (err) {
    console.error('[ERROR] /registrations.json:', err);
    res.status(500).json({ ok: false, error: 'Error generando JSON.' });
  }
});

// Descarga CSV (desde MongoDB)
app.get('/registrations.csv', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ok: false, error: 'DB no disponible.' });
    }
    const items = await Registration.find({}).sort({ createdAt: -1 }).lean();
    const headers = ['name', 'email', 'organization', 'role', 'phone', 'notes', 'consent', 'source', 'createdAt'];
    const escapeCSV = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csvLines = [
      headers.join(',')
    ].concat(items.map(row => headers.map(h => escapeCSV(row[h])).join(',')));

    const csv = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[ERROR] /registrations.csv:', err);
    res.status(500).json({ ok: false, error: 'Error generando CSV.' });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Arranque
app.listen(PORT, () => {
  console.log(`[OK] Meeting Invite API escuchando en puerto ${PORT}`);
});

  try {
    const {
      name, email, organization, role, phone, notes, consent, source
    } = req.body || {};

    if (!email || !name) {
      return res.status(400).json({ ok: false, error: 'name y email son obligatorios.' });
    }

    // Guarda en Mongo si está conectado
    let saved = null;
    if (mongoose.connection.readyState === 1) {
      saved = await Registration.create({
        name, email, organization, role, phone, notes, consent: !!consent, source
      });
    }

    // ICS y correo
    const ics = buildIcsFromMeeting();
    await sendMail({
      to: email,
      subject: process.env.MAIL_SUBJECT || 'Confirmación de registro a la reunión',
      html: emailHtml({ name }),
      icsBuffer: Buffer.from(ics, 'utf8')
    });

    res.json({
      ok: true,
      saved: !!saved,
      message: 'Registro exitoso. Correo enviado con .ics.'
    });
  } catch (err) {
    console.error('[ERROR] /register:', err);
    res.status(500).json({ ok: false, error: 'Error en el servidor.' });
  }
});

// Descarga JSON (desde MongoDB)
app.get('/registrations.json', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ok: false, error: 'DB no disponible.' });
    }
    const items = await Registration.find({}).sort({ createdAt: -1 }).lean();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(items, null, 2));
  } catch (err) {
    console.error('[ERROR] /registrations.json:', err);
    res.status(500).json({ ok: false, error: 'Error generando JSON.' });
  }
});

// Descarga CSV (desde MongoDB)
app.get('/registrations.csv', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ok: false, error: 'DB no disponible.' });
    }
    const items = await Registration.find({}).sort({ createdAt: -1 }).lean();
    const headers = ['name', 'email', 'organization', 'role', 'phone', 'notes', 'consent', 'source', 'createdAt'];
    const escapeCSV = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csvLines = [
      headers.join(',')
    ].concat(items.map(row => headers.map(h => escapeCSV(row[h])).join(',')));

    const csv = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[ERROR] /registrations.csv:', err);
    res.status(500).json({ ok: false, error: 'Error generando CSV.' });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Arranque
app.listen(PORT, () => {
  console.log(`[OK] Meeting Invite API escuchando en puerto ${PORT}`);
});
