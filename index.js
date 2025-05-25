require('dotenv').config();
const tmi = require('tmi.js');
const axios = require('axios');

// Configuración del bot
const config = {
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    token: process.env.TWITCH_TOKEN,
    channel: 'blackelespanolito',
  },
};

// Cooldown para !clip
const COOLDOWN_SECONDS = 30;
let lastClipTime = 0;

// Cache para deduplicación
const processedMessages = new Map();
const MESSAGE_CACHE_DURATION = 10000;

// Obtener broadcaster_id
async function getBroadcasterId(channelName) {
  try {
    const response = await axios.get(`https://api.twitch.tv/helix/users?login=${channelName}`, {
      headers: {
        'Client-ID': config.twitch.clientId,
        'Authorization': `Bearer ${config.twitch.token}`,
      },
    });
    const broadcasterId = response.data.data[0]?.id;
    if (!broadcasterId) throw new Error('No se encontró el broadcaster_id');
    return broadcasterId;
  } catch (error) {
    console.error('Error al obtener broadcaster_id:', error.message);
    return null;
  }
}

// Crear clip
async function createClip(broadcasterId) {
  try {
    const response = await axios.post(
      `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`,
      {},
      {
        headers: {
          'Client-ID': config.twitch.clientId,
          'Authorization': `Bearer ${config.twitch.token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return `https://clips.twitch.tv/${response.data.data[0].id}`;
  } catch (error) {
    console.error('Error al crear clip:', error.message);
    return null;
  }
}

// Configurar cliente de Twitch
const client = new tmi.Client({
  options: { debug: true },
  connection: { secure: true, reconnect: true },
  identity: {
    username: process.env.BOT_USERNAME,
    password: process.env.TWITCH_OAUTH,
  },
  channels: [config.twitch.channel],
});

// Eventos de conexión
client.on('connected', (address, port) => console.log(`Bot conectado a ${address}:${port}`));
client.on('reconnect', () => console.log('Reconectando al chat...'));

// Limpiar cache
setInterval(() => {
  const now = Date.now();
  for (const [messageId, timestamp] of processedMessages) {
    if (now - timestamp > MESSAGE_CACHE_DURATION) processedMessages.delete(messageId);
  }
}, MESSAGE_CACHE_DURATION);

// Conectar
client.connect().catch(error => console.error('Error al conectar:', error));

// Manejar mensajes
client.on('message', async (channel, tags, message, self) => {
  if (self) return;
  const messageId = tags.id;
  if (!messageId || processedMessages.has(messageId)) return;
  processedMessages.set(messageId, Date.now());
  const username = tags.username;
  const isModerator = tags.mod || (tags.badges && tags.badges.moderator);
  const isBroadcaster = tags.badges && tags.badges.broadcaster;

  // !clip
  if (message.toLowerCase() === '!clip') {
    const isGoaleex = username.toLowerCase() === 'goaleex';
    const isSuiiigfx = username.toLowerCase() === 'suiiigfx';
    if (!isModerator && !isBroadcaster && !isGoaleex && !isSuiiigfx) {
      client.say(channel, 'Solo moderadores, goaleex o suiiigfx pueden usar este comando');
      return;
    }
    const currentTime = Date.now();
    if ((currentTime - lastClipTime) / 1000 < COOLDOWN_SECONDS) {
      client.say(channel, `Espera ${Math.ceil(COOLDOWN_SECONDS - (currentTime - lastClipTime) / 1000)} segundos`);
      return;
    }
    const broadcasterId = await getBroadcasterId(config.twitch.channel);
    if (!broadcasterId) {
      client.say(channel, 'Error al obtener ID del canal');
      return;
    }
    const clipUrl = await createClip(broadcasterId);
    client.say(channel, clipUrl ? `¡Clip creado! ${clipUrl}` : 'No pude crear el clip, ¿estás en vivo?');
    lastClipTime = currentTime;
    return;
  }
});

console.log(`Iniciando bot para ${config.twitch.channel} con ${process.env.BOT_USERNAME}...`);