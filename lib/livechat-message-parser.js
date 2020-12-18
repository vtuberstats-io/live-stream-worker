function parseTextMessage(detail) {
  return detail.message.runs
    .map((r) => r.text)
    .map((t) => ({
      type: 'text',
      message: t,
      isMember: !!detail.authorBadges?.[0]?.liveChatAuthorBadgeRenderer?.tooltip?.includes('Member')
    }));
}

function parseSuperChatMessage(detail) {
  return [
    {
      type: 'superchat',
      message: detail.message.runs.map((r) => r.text).reduce((prev, curr) => `${prev} ${curr}`, ''),
      amountText: detail.purchaseAmountText.simpleText
    }
  ];
}

const PARSERS_MAP = {
  liveChatTextMessageRenderer: parseTextMessage,
  liveChatPaidMessageRenderer: parseSuperChatMessage
};

const IGNORED_MESSAGE_RENDERERS = [
  'liveChatViewerEngagementMessageRenderer',
  'liveChatPurchasedProductMessageRenderer',
  'liveChatPlaceholderItemRenderer',
  'liveChatModeChangeMessageRenderer',
  // TODO: support membership statistics
  'liveChatMembershipItemRenderer',
  'liveChatPaidStickerRenderer',
  'liveChatTickerPaidStickerItemRenderer',
  'liveChatTickerPaidMessageItemRenderer',
  'liveChatTickerSponsorItemRenderer'
];

function parse(action) {
  try {
    const item = Object.entries(action.actions[0]).find(([key]) => key.includes('Action'))?.[1]
      ?.item;
    const type = Object.keys(item)[0];
    if (IGNORED_MESSAGE_RENDERERS.includes(type)) {
      return [];
    }

    const detail = Object.values(item)[0];
    if (!detail) {
      throw new Error('empty item detail');
    }

    const parser = PARSERS_MAP[type];
    if (!parser) {
      throw new Error(`unknown message type: '${type}'`);
    }

    const offsetTimeMs = Number(action.videoOffsetTimeMsec);
    return parser(detail).map((r) => ({
      offsetTimeMs,
      ...r
    }));
  } catch (e) {
    return [
      {
        error: e.stack,
        actionRaw: action
      }
    ];
  }
}

function* parseMessageActions(actions) {
  for (const action of actions) {
    for (const result of parse(action)) {
      yield result;
    }
  }
}

module.exports = { parseMessageActions };
