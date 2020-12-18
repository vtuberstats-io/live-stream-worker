// Many thanks to @xenova and https://github.com/xenova/chat-replay-downloader/

const axios = require('axios');
const { parseMessageActions } = require('./livechat-message-parser');

axios.defaults.headers.common['Accept-Language'] = 'en-US, en';
axios.defaults.headers.common['User-Agent'] =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.111 Safari/537.36';

const YOUTUBE_INITIAL_DATA_REGEX = /var\s+ytInitialData\s*=\s*(\{.+?\})\s*;/;

function wait(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function fetchInitialContinuation(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const data = (await axios.get(url)).data;
  const info = YOUTUBE_INITIAL_DATA_REGEX.exec(data)?.[1];
  if (!info) {
    throw new Error(`unknown initial data for videoId: '${videoId}', data: '${data}'`);
  }

  const results = JSON.parse(info)?.contents?.twoColumnWatchNextResults;
  if (!results?.conversationBar?.liveChatRenderer) {
    throw new Error(`unknown initial data for videoId: '${videoId}', data: '${data}'`);
  }

  const subMenuItems =
    results.conversationBar.liveChatRenderer.header.liveChatHeaderRenderer.viewSelector
      .sortFilterSubMenuRenderer.subMenuItems;
  return subMenuItems.find((item) => item.title === 'Live chat replay')?.continuation
    .reloadContinuationData.continuation;
}

async function fetchNextContinuation(videoId, continuation) {
  const url = `https://www.youtube.com/live_chat_replay/get_live_chat_replay?pbj=1&hidden=false&playerOffsetMs=0&continuation=${continuation}`;
  return (await axios.get(url)).data.response.continuationContents.liveChatContinuation;
}

async function handleContinuation(continuations) {
  if (!continuations) {
    return null;
  }
  const pickedContinuationData = Object.values(continuations[0])[0];
  await wait(pickedContinuationData.timeUntilLastMessageMsec || 5000);
  return pickedContinuationData.continuation;
}

function getValidMessageActions(liveChatContinuation) {
  return liveChatContinuation.actions
    .map((a) => a.replayChatItemAction)
    .filter((a) => a)
    .filter((a) => Object.entries(a.actions[0]).find(([key]) => key.includes('Action'))?.[1]?.item);
}

async function* fetchLiveChatMessages(videoId) {
  try {
    let continuation = await fetchInitialContinuation(videoId);
    while (continuation) {
      try {
        const liveChatContinuation = await fetchNextContinuation(videoId, continuation);
        const validMessageActions = getValidMessageActions(liveChatContinuation);
        yield [...parseMessageActions(validMessageActions)];
        continuation = await handleContinuation(liveChatContinuation.continuations);
      } catch (e) {
        yield { error: e.stack };
      }
    }
  } catch (e) {
    // happens when fetchInitialContinuation fails
    return { error: e.stack };
  }
}

module.exports = { fetchLiveChatMessages };
