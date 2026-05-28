require('dotenv').config();
const express = require('express');
const { middleware, messagingApi } = require('@line/bot-sdk');
const { MessagingApiClient } = messagingApi;

const app = express();
const contacts = {};

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

function searchOtherAccounts(displayName, sourceAccountName) {
  const matches = [];
  for (const [name, data] of Object.entries(contacts)) {
    if (name === sourceAccountName) continue;
    if (data.some(c => c.displayName.toLowerCase() === displayName.toLowerCase())) {
      matches.push(name);
    }
  }
  return matches;
}

accounts.forEach(account => {
  const config = {
    channelAccessToken: account.token,
    channelSecret: account.secret,
  };

  const client = new MessagingApiClient({ channelAccessToken: account.token });
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
        console.log(`[${account.name}] New contact logged: ${displayName}`);
      }

      const matches = searchOtherAccounts(displayName, account.name);

      if (matches.length > 0) {
        console.log(`DUPLICATE DETECTED: "${displayName}" on ${account.name} also exists on: ${matches.join(', ')}`);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: `⚠️ Duplicate contact detected!\n\n"${displayName}" has also messaged: ${matches.join(', ')}\n\nPlease check before assigning.`
          }]
        });
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
  console.log('Webhook URLs:');
  accounts.forEach(a => {
    console.log(` - /webhook/${a.name.replace(' ', '-').toLowerCase()}`);
  });
});