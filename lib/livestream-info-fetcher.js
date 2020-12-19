async function fetchFromYoutube(youtubeApi, videoId) {
  const response = await youtubeApi.videos.list({
    id: videoId,
    part: 'snippet,status,statistics,liveStreamingDetails'
  });
  if (!response?.data?.items) {
    throw new Error(`invalid youtube response: ${JSON.stringify(response)}`);
  }
  return response.data.items[0];
}

function getThumbnailOfHighestResolutionVersion(thumbnails) {
  const { maxres, standard, high, medium, default: default_ } = thumbnails;
  return maxres || standard || high || medium || default_;
}

function handleTime(time) {
  return !time ? null : new Date(time).toISOString();
}

async function fetchLivestreamInfo(youtubeApi, videoId) {
  const info = await fetchFromYoutube(youtubeApi, videoId);

  return {
    title: info.snippet.title,
    description: info.snippet.description,
    thumbnailUrl: getThumbnailOfHighestResolutionVersion(info.snippet.thumbnails).url,
    tags: info.snippet.tags,
    isLive: info.snippet.liveBroadcastContent === 'live',
    viewCount: Number(info.statistics.viewCount),
    viewerCount: Number(info.liveStreamingDetails.concurrentViewers),
    likeCount: Number(info.statistics.likeCount),
    dislikeCount: Number(info.statistics.dislikeCount),
    scheduledStartTime: handleTime(info.liveStreamingDetails.scheduledStartTime),
    scheduledEndTime: handleTime(info.liveStreamingDetails.scheduledEndTime),
    actualStartTime: handleTime(info.liveStreamingDetails.actualStartTime),
    actualEndTime: handleTime(info.liveStreamingDetails.actualEndTime)
  };
}

module.exports = { fetchLivestreamInfo };
