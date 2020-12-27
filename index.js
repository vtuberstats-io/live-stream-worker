const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS;
const DOMAIN = process.env.DOMAIN;
const VIDEO_ID = process.env.VIDEO_ID;
const FETCH_INFO_INTERVAL_SECONDS = process.env.FETCH_INFO_INTERVAL_SECONDS || 200;
const REDIS = process.env.REDIS;
const HOSTNAME = process.env.HOSTNAME; // offered by kubernetes automatically

if (!YOUTUBE_API_KEY || !KAFKA_BROKERS || !DOMAIN || !VIDEO_ID || !REDIS || !HOSTNAME) {
  console.error(`missing environment variables, env: ${JSON.stringify(process.env)}`);
  process.exit(1);
}

const { addExitHook, executeAllHooksAndTerminate } = require('exit-hook-plus');
const { google } = require('googleapis');
const { Kafka } = require('kafkajs');
const Redis = require('ioredis');
const { fetchLivestreamInfo } = require('./lib/livestream-info-fetcher');
const { fetchLiveChatMessages } = require('./lib/livechat-fetcher');

const youtubeApi = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });
const kafka = new Kafka({
  clientId: HOSTNAME,
  brokers: KAFKA_BROKERS.trim().split(',')
});
const producer = kafka.producer();
const redis = new Redis(REDIS);

async function init() {
  console.info('connecting to redis');
  await redis.connect();
  addExitHook(async () => await redis.quit());

  // TODO: domain for bilibili

  const lastContinuation = await redis.hget(`lsw-${HOSTNAME}`, 'continuation');
  if (lastContinuation) {
    console.info(`will recover using latest continuation: '${lastContinuation}'`);
  }

  console.info('connecting to kafka brokers');
  await producer.connect();
  addExitHook(async () => await producer.disconnect());

  initFetchLivestreamInfo();

  console.info(`start collecting livechat messages of video ${VIDEO_ID}`);
  await doCollectLivechatMessages(lastContinuation);
}

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
              meta: {
                timestamp: new Date().toISOString(),
                domain: DOMAIN,
                videoId: VIDEO_ID
              },
              data: info
            })
          }
        ]
      });
    } catch (e) {
      console.error(`error fetching livestream info: ${e.stack}`);
    }

    if (streamEnded) {
      console.info('stream ended. will exit in 60 seconds, bye');
      addExitHook(async () => await redis.hdel(`lsw-${HOSTNAME}`, 'continuation'));
      setTimeout(() => executeAllHooksAndTerminate(0, {}), 60 * 1000);
    } else {
      setTimeout(fetchTask, FETCH_INFO_INTERVAL_SECONDS * 1000);
    }
  };

  fetchTask();
}

async function doCollectLivechatMessages(lastContinuation) {
  for await (const chatMessages of fetchLiveChatMessages(
    VIDEO_ID,
    async (c) => await onNewContinuation(c),
    lastContinuation
  )) {
    const validMessages = chatMessages.filter((message) => {
      if (message.error) {
        console.warn(
          `error collecting livechat messages: ${message.error}, actionRaw: ${message.actionRaw}`
        );
        return false;
      }
      return true;
    });

    if (validMessages.length <= 0) {
      continue;
    }

    console.info(`sending ${validMessages.length} messages to kafka`);
    await producer.send({
      acks: -1,
      topic: 'livechat-message',
      messages: validMessages.map((m) => ({
        value: JSON.stringify({
          meta: {
            offsetTimeMs: m.offsetTimeMs,
            domain: DOMAIN,
            videoId: VIDEO_ID
          },
          data: m
        })
      }))
    });
  }
}

async function onNewContinuation(continuation) {
  await redis.hset(`lsw-${HOSTNAME}`, 'continuation', continuation);
}
