// JavaScript source code
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// --- Fixed Meeting Data ---
const MEETING = {
    title: 'Reunión de la sesión de cinética',
    dateText: 'Monday, 25 August from 5:00 to 6:00pm',
    timezone: 'America/Mexico_City',
    startISO: '2025-08-25T17:00:00-06:00', // 5:00pm local time
    endISO: '2025-08-25T18:00:00-06:00',   // 6:00pm local time
    joinUrl: 'https://meet.google.com/gsa-btnb-dmq',
    dialInfo: '?(MX) +52 55 8421 0898? PIN: ?496 952 841 6855?#',
    morePhones: 'https://tel.meet/gsa-btnb-dmq?pin=4969528416855'
};

// --- Helper: ICS Date Format ---
function toICSDate(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return (
        d.getUTCFullYear() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) +
        'Z'
    );
}

// --- ICS Content ---
function createICS({ title, startISO, endISO, joinUrl }) {
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Dikevi Chimie//Meeting Invite//ES',
        'BEGIN:VEVENT',
        `UID:${Date.now()}@dikevichimie.com`,
        `DTSTAMP:${toICSDate(new Date().toISOString())}`,
        `DTSTART:${toICSDate(startISO)}`,
        `DTEND:${toICSDate(endISO)}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:Unirse: ${joinUrl}`,
        `LOCATION:Online`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

// --- Email HTML Template ---
function emailHtml({ name, email }) {
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

// --- Email Transport ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// --- Registration Endpoint ---
app.post('/register', async (req, res) => {
    try {
        const { name, email, position, orgType, orgName, optIn } = req.body;
        if (!name || !email) {
            return res.status(400).json({ message: 'Nombre y correo son requeridos.' });
        }

        // Save registration to JSON file
        const record = { name, email, position, orgType, orgName, optIn, date: new Date().toISOString() };
        const file = './registrations.json';
        let registrations = [];
        if (fs.existsSync(file)) {
            registrations = JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        registrations.push(record);
        fs.writeFileSync(file, JSON.stringify(registrations, null, 2));

        // Create ICS file content
        const icsContent = createICS(MEETING);

        // Send email
        await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: email,
            subject: `Invitacion: ${MEETING.title}`,
            html: emailHtml({ name, email }),
            attachments: [
                {
                    filename: 'invitation.ics',
                    content: icsContent,
                    contentType: 'text/calendar'
                }
            ]
        });

        res.json({ message: '¡Invitación enviada! Revisa tu correo.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al enviar la invitación.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));