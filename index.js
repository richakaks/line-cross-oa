require('dotenv').config();
const express = require('express');
const fs = require('fs');
const { middleware, messagingApi } = require('@line/bot-sdk');
const { MessagingApiClient } = messagingApi;

const app = express();
const CONTACTS_FILE = './contacts.json';
const ADMIN_USER_ID = 'Uea8e01a4d473f70d4d352ebe21c56a11';

function loadContacts() {
  try {
    if (fs.existsSync(CONTACTS_FILE)) {
      const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading contacts:', e.message);
  }
  return {};
}

function saveContacts(contacts) {
  try {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
  } catch (e) {
    console.error('Error saving contacts:', e.message);
  }
}

const contacts = loadContacts();

const accounts = [
  { name: 'NiceLED', token: process.env.NICELED_TOKEN, secret: process.env.NICELED_SECRET },
  { name: 'Nine Lights', token: process.env.NINE_TOKEN, secret: process.env.NINE_SECRET },
  { name: 'About Lights', token: process.env.ABOUT_TOKEN, secret: process.env.ABOUT_SECRET },
];

async function getDisplayName(token, userId) {
  const client = new MessagingApiClient({ channelAccessToken: token });
  try {
    const profile = await client.getProfile(userId);
    return profile.displayName;
  } catch (e) {
    console.error('getProfile error:', e.message);
    return null;
  }
}

function searchOtherAccounts(userId, sourceAccountName) {
  const matches = [];
  for (const [name, data] of Object.entries(contacts)) {
    if (name === sourceAccountName) continue;
    if (data.some(c => c.userId === userId)) {
      matches.push(name);
    }
  }
  return matches;
}

async function notifyAdmin(token, accountName, displayName, matches) {
  console.log(`Attempting push to: ${ADMIN_USER_ID} using token from: ${accountName}`);
  const adminClient = new MessagingApiClient({ channelAccessToken: token });
  try {
    await adminClient.pushMessage({
      to: ADMIN_USER_ID,
      messages: [{
        type: 'text',
        text: `⚠️ Duplicate contact detected!\n\n"${displayName}" has messaged ${accountName} but also exists on: ${matches.join(', ')}\n\nPlease assign manually.`
      }]
    });
    console.log(`Admin notified successfully for ${displayName}`);
  } catch (e) {
    console.error('Failed to notify admin:', e.message);
    console.error('Full error:', JSON.stringify(e, null, 2));
  }
}

accounts.forEach(account => {
  const config = {
    channelAccessToken: account.token,
    channelSecret: account.secret,
  };

  const router = express.Router();

  router.post('/', middleware(config), async (req, res) => {
    const events = req.body.events;

    for (const event of events) {
      if (event.type !== 'message') continue;

      const userId = event.source.userId;
      const displayName = await getDisplayName(account.token, userId);

      if (!displayName) continue;

      if (!contacts[account.name]) contacts[account.name] = [];

      const alreadyLogged = contacts[account.name].some(c => c.userId === userId);
      if (!alreadyLogged) {
        contacts[account.name].push({ userId, displayName });
        saveContacts(contacts);
        console.log(`Captured User ID: ${userId} for ${displayName} on ${account.name}`);
        console.log(`[${account.name}] New contact logged: ${displayName}`);
      } else {
        console.log(`[${account.name}] Existing contact messaged: ${displayName}`);
      }

      const matches = searchOtherAccounts(userId, account.name);

      if (matches.length > 0) {
        console.log(`DUPLICATE DETECTED: "${displayName}" on ${account.name} also exists on: ${matches.join(', ')}`);
        await notifyAdmin(process.env.NICELED_TOKEN, account.name, displayName, matches);
      } else {
        console.log(`[${account.name}] "${displayName}" — no duplicates found`);
      }
    }

    res.sendStatus(200);
  });

  app.use(`/webhook/${account.name.replace(' ', '-').toLowerCase()}`, router);
});

accounts.forEach(account => {
  app.get(`/webhook/${account.name.replace(' ', '-').toLowerCase()}`, (req, res) => {
    res.sendStatus(200);
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
  console.log(`Contacts loaded: ${Object.values(contacts).flat().length} total`);
  console.log('Webhook URLs:');
  accounts.forEach(a => {
    console.log(` - /webhook/${a.name.replace(' ', '-').toLowerCase()}`);
  });
});