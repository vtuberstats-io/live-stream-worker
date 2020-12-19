// Many thanks to @xenova and https://github.com/xenova/chat-replay-downloader/

const axios = require('./axios-wrapper');
const { parseMessageActions } = require('./livechat-message-parser');

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
  const pickedContinuationData = continuations.find((item) =>
    Object.keys(item).includes('liveChatReplayContinuationData')
  ).liveChatReplayContinuationData;
  await wait(pickedContinuationData.timeUntilLastMessageMsec);
  return pickedContinuationData.continuation;
}

function getValidMessageActions(liveChatContinuation) {
  return liveChatContinuation.actions
    .map((a) => a.replayChatItemAction)
    .filter((a) => a)
    .filter((a) => Object.entries(a.actions[0]).find(([key]) => key.includes('Action'))?.[1]?.item);
}

async function* fetchLiveChatMessages(videoId) {
  let continuation = await fetchInitialContinuation(videoId);
  while (continuation) {
    const liveChatContinuation = await fetchNextContinuation(videoId, continuation);
    try {
      const validMessageActions = getValidMessageActions(liveChatContinuation);
      yield [...parseMessageActions(validMessageActions)];
    } catch (e) {
      yield [{ error: e.stack }];
    }
    continuation = await handleContinuation(liveChatContinuation.continuations);
  }
}

module.exports = { fetchLiveChatMessages };
