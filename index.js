const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS;
const VIDEO_ID = process.env.VIDEO_ID;
const FETCH_INFO_INTERVAL_SECONDS = process.env.FETCH_INFO_INTERVAL_SECONDS || 200;
const HOSTNAME = process.env.HOSTNAME; // offered by kubernetes automatically

if (!YOUTUBE_API_KEY || !KAFKA_BROKERS || !VIDEO_ID || !HOSTNAME) {
  console.error(`missing environment variables, env: ${JSON.stringify(process.env)}`);
  process.exit(1);
}

const { addExitHook, registerExitListener } = require('./lib/exit-hook');
const { google } = require('googleapis');
const { Kafka } = require('kafkajs');
const { fetchLivestreamInfo } = require('./lib/livestream-info-fetcher');
const { fetchLiveChatMessages } = require('./lib/livechat-fetcher');

const youtubeApi = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });
const kafka = new Kafka({
  clientId: HOSTNAME,
  brokers: KAFKA_BROKERS.trim().split(',')
});
const producer = kafka.producer();

async function init() {
  console.info('connecting to kafka brokers');
  await producer.connect();
  addExitHook(async () => await producer.disconnect());

  initFetchLivestreamInfo();

  console.info(`start collecting livechat messages of video ${VIDEO_ID}`);
  await doCollectLivechatMessages();
}

registerExitListener();
init();

function initFetchLivestreamInfo() {
  const fetchTask = async () => {
    let streamEnded = false;
    try {
      console.info('fetching livestream info');
      const info = await fetchLivestreamInfo(youtubeApi, VIDEO_ID);
      streamEnded = !info.isLive;

      console.info('sending livestream info to kafka');
      await producer.send({
        acks: 1,
        topic: 'livestream-info',
        messages: [
          {
            value: JSON.stringify({
              videoId: VIDEO_ID,
              data: info
            })
          }
        ]
      });
    } catch (e) {
      console.error(`error fetching livestream info: ${e.stack}`);
    }

    if (streamEnded) {
      console.info('stream ended. will exit in 8 seconds, bye');
      setTimeout(() => process.exit(0), 8000);
    } else {
      setTimeout(fetchTask, FETCH_INFO_INTERVAL_SECONDS * 1000);
    }
  };

  fetchTask();
}

async function doCollectLivechatMessages() {
  for await (const chatMessages of fetchLiveChatMessages(VIDEO_ID)) {
    const validMessages = chatMessages.filter((message) => {
      if (message.error) {
        console.warn(`error collecting livechat messages: ${message.error}`);
        return false;
      }
      return true;
    });

    console.info(`sending ${validMessages.length} messages to kafka`);
    await producer.send({
      acks: -1,
      topic: 'livechat-message',
      messages: validMessages.map((m) => ({
        value: JSON.stringify({
          videoId: VIDEO_ID,
          data: m
        })
      }))
    });
  }
}
