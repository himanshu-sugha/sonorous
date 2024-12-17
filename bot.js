const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Replace this with your Telegram Bot Token
const TOKEN = '8133821130:AAFkxV1pcFTmv_Ghle2eoYCdvDfweA6vMtc';
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("Bot is running...");

// YouTube API Key (replace with your key)
const YOUTUBE_API_KEY = 'AIzaSyCvFmxeLHGXeZ285886WEuHev9W8QJ81eA';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';

// Predefined list of music genres
const genres = ['pop', 'rock', 'hip hop', 'classical', 'electronic', 'jazz'];

// Simulated data for user tokens and NFTs
let battles = {};
let userTokens = {};
let userNFTs = {};
let leaderboard = {}; // This stores user scores

// Function to send options menu
function sendOptions(chatId) {
  const optionsMessage = `
🎵 **Available Commands:** 🎵

1. 🎶 **/startbattle** - Start a random music battle.
2. 🎶 **/custombattle** - Create a custom music battle (provide YouTube track links).
3. 🏆 **/leaderboard** - View the current leaderboard.
4. 🔗 **/connectwallet** - Link your wallet (coming soon).

Enter one of the above commands to get started! 🚀
  `;
  bot.sendMessage(chatId, optionsMessage, { parse_mode: "Markdown" });
}

// Select a random genre from the list
function getRandomGenre() {
  const randomIndex = Math.floor(Math.random() * genres.length);
  return genres[randomIndex];
}

// Fetch two random tracks from YouTube based on a genre
async function getTracksFromYouTube(genre) {
  try {
    const response = await axios.get(YOUTUBE_API_URL, {
      params: {
        part: 'snippet',
        maxResults: 2,
        q: genre + ' music', 
        type: 'video',
        key: YOUTUBE_API_KEY,
      }
    });

    const tracks = response.data.items.map(item => ({
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      link: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      albumArt: item.snippet.thumbnails.high.url
    }));

    return tracks;
  } catch (error) {
    console.error("Error fetching tracks from YouTube:", error);
    return [];
  }
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'User';

  const welcomeMessage = `
👋 Welcome to the Music Battle Bot, ${userName}! 🎶

Get ready to challenge your friends and the community in exciting music battles. Here's what you can do:
  `;

  bot.sendMessage(chatId, welcomeMessage).then(() => {
    sendOptions(chatId);
  }).catch(err => {
    console.log('Error sending welcome message:', err);
  });
});

// Handle normal chat or wrong commands
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userName = msg.from.first_name || 'User';

  // If the message is not a valid command
  if (!text.startsWith('/')) {
    const invalidMessage = `
    ⚠️ Hey ${userName}, it looks like you sent a normal message or an invalid command.

    Here's a quick guide on how to interact with the bot:
    `;
    bot.sendMessage(chatId, invalidMessage).then(() => {
      sendOptions(chatId);
    });
  }
});

// Start Music Battle Command
bot.onText(/\/startbattle/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'User';
  const genre = getRandomGenre();

  console.log(`StartBattle command received for genre: ${genre}`);

  const tracks = await getTracksFromYouTube(genre);

  if (tracks.length < 2) {
    bot.sendMessage(chatId, "Sorry, couldn't find enough tracks for this genre. Please try again later.");
    return;
  }

  // If a battle is already ongoing, terminate the previous battle
  if (battles[chatId]) {
    bot.sendMessage(chatId, "A battle is already ongoing. It will be terminated.");
    clearInterval(battles[chatId].countdownInterval); // Stop the countdown
    delete battles[chatId]; // Remove the battle
  }

  battles[chatId] = { track1: tracks[0], track2: tracks[1], votes: { track1: 0, track2: 0 }, winner: null, votedUsers: [] };

  const message = `
🎶 **Music Battle Started in Genre: ${genre}** 🎶

**Track 1:**
![Track 1 Thumbnail](${tracks[0].albumArt})
${tracks[0].title} by ${tracks[0].artist}

**Track 2:**
![Track 2 Thumbnail](${tracks[1].albumArt})
${tracks[1].title} by ${tracks[1].artist}

Vote for your favorite track below:
  `;

  bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: `🎶 Vote Track 1 (${battles[chatId].votes.track1} votes)`, callback_data: "vote_track1" }],
        [{ text: `🎶 Vote Track 2 (${battles[chatId].votes.track2} votes)`, callback_data: "vote_track2" }]
      ]
    }
  }).then((sentMessage) => {
    let remainingTime = 20;

    const countdownMessage = bot.sendMessage(chatId, `⏳ Battle ends in ${remainingTime} seconds...`);

    const countdownInterval = setInterval(() => {
      remainingTime--;
      bot.editMessageText(`⏳ Battle ends in ${remainingTime} seconds...`, {
        chat_id: chatId,
        message_id: countdownMessage.message_id,
      });

      if (remainingTime <= 0) {
        clearInterval(countdownInterval);

        const winnerTrack = battles[chatId].votes.track1 > battles[chatId].votes.track2 ? "Track 1" : "Track 2";
        battles[chatId].winner = winnerTrack;

        if (battles[chatId].votes.track1 === 0 && battles[chatId].votes.track2 === 0) {
          bot.sendMessage(chatId, "No votes were cast in this battle. It's a tie! 😔");
        } else {
          bot.sendMessage(chatId, `${winnerTrack} wins the battle! 🎉`);
        }

        distributeRewards(chatId);
        updateLeaderboard(chatId, winnerTrack);

        delete battles[chatId];
      }
    }, 1000);

    battles[chatId].countdownInterval = countdownInterval;
  });
});

// Voting Logic
bot.on("callback_query", (callbackQuery) => {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;

  if (!battles[chatId]) {
    bot.answerCallbackQuery(callbackQuery.id, { text: "No active battle here." });
    return;
  }

  const battle = battles[chatId];

  // Check if user already voted
  if (battle.votedUsers.includes(userId)) {
    bot.answerCallbackQuery(callbackQuery.id, { text: "You can only vote once per battle." });
    return;
  }

  if (data === "vote_track1") {
    battle.votes.track1++;
    battle.votedUsers.push(userId);
    updateTokens(userId, 5);
    bot.answerCallbackQuery(callbackQuery.id, { text: "You voted for Track 1 🎶" });
  } else if (data === "vote_track2") {
    battle.votes.track2++;
    battle.votedUsers.push(userId);
    updateTokens(userId, 5);
    bot.answerCallbackQuery(callbackQuery.id, { text: "You voted for Track 2 🎶" });
  }

  const updatedMessage = `
🎶 **Music Battle Update!** 🎶

![Track 1 Thumbnail](${battle.track1.albumArt})
**Track 1:** ${battle.track1.title} by ${battle.track1.artist} - ${battle.votes.track1} votes

![Track 2 Thumbnail](${battle.track2.albumArt})
**Track 2:** ${battle.track2.title} by ${battle.track2.artist} - ${battle.votes.track2} votes

Vote for your favorite track below:
  `;

  bot.editMessageText(updatedMessage, {
    chat_id: chatId,
    message_id: message.message_id,
    reply_markup: {
      inline_keyboard: [
        [{ text: `🎶 Vote Track 1 (${battle.votes.track1} votes)`, callback_data: "vote_track1" }],
        [{ text: `🎶 Vote Track 2 (${battle.votes.track2} votes)`, callback_data: "vote_track2" }]
      ]
    }
  });
});

// Leaderboard Command
bot.onText(/\/leaderboard/, (msg) => {
  const chatId = msg.chat.id;

  let leaderboardMessage = "🏆 **Leaderboard** 🏆\n\n";

  // Sort leaderboard by points
  const sortedLeaderboard = Object.keys(leaderboard)
    .map(userId => ({ userId, points: leaderboard[userId] }))
    .sort((a, b) => b.points - a.points);

  sortedLeaderboard.forEach((user, index) => {
    leaderboardMessage += `${index + 1}.  ${user.userId} - ${user.points} points\n`;
  });

  bot.sendMessage(chatId, leaderboardMessage);
});

// Update Tokens Function
function updateTokens(userId, points) {
  if (!userTokens[userId]) {
    userTokens[userId] = 0;
  }
  userTokens[userId] += points;
}

// Distribute Rewards
function distributeRewards(chatId) {
  Object.keys(battles[chatId].votes).forEach((userId) => {
    updateTokens(userId, 10); // Example reward for participating
  });
}

// Update Leaderboard with winner's reward
function updateLeaderboard(chatId, winnerTrack) {
  let winner, loser;

  if (winnerTrack === "Track 1") {
    winner = battles[chatId].track1;
    loser = battles[chatId].track2;
  } else {
    winner = battles[chatId].track2;
    loser = battles[chatId].track1;
  }

  // Increase points for the winner
  if (!leaderboard[winner.artist]) {
    leaderboard[winner.artist] = 0;
  }
  leaderboard[winner.artist] += 50; // Winner gets 50 points

  // Increase points for the loser
  if (!leaderboard[loser.artist]) {
    leaderboard[loser.artist] = 0;
  }
  leaderboard[loser.artist] += 20; // Loser gets 20 points
}
