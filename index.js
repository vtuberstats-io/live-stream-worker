const KAFKA_BROKERS = process.env.KAFKA_BROKERS;
const VIDEO_ID = process.env.VIDEO_ID;
const HOSTNAME = process.env.HOSTNAME; // offered by kubernetes automatically

if (!KAFKA_BROKERS || !VIDEO_ID || !HOSTNAME) {
  console.error(`missing environment variables, env: ${JSON.stringify(process.env)}`);
  process.exit(1);
}

const { Kafka } = require('kafkajs');
const { fetchLiveChatMessages } = require('./lib/youtube-fetcher');

const kafka = new Kafka({
  clientId: HOSTNAME,
  brokers: KAFKA_BROKERS.trim().split(',')
});
const producer = kafka.producer();

async function init() {
  console.info('connecting to kafka brokers');
  await producer.connect();

  console.info(`start collecting livechat messages of video ${VIDEO_ID}`);
  for await (const chatMessages of fetchLiveChatMessages(VIDEO_ID)) {
    await producer.send({
      acks: -1,
      topic: 'live-chat-message',
      messages: chatMessages.map((m) => ({
        value: {
          videoId: VIDEO_ID,
          data: m
        }
      }))
    });
  }

  console.info('collect completed, bye');
}

init().catch((e) => console.error(e));
