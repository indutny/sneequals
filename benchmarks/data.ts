import produce from 'immer';

type Message = {
  content: string;
  authorId: string;
  timestamp: number;
  attachments: Array<{ type: string; url: string }>;
  status: 'sent' | 'read';
};

type Conversation = {
  title: string;
  phoneNumber: string;
  unreadCount: number;
};

export const initial = {
  conversations: {
    alice: {
      title: 'Alice',
      phoneNumber: '+33-3-52-18-72-64',
      unreadCount: 5,
    },
    bob: {
      title: 'Bob',
      phoneNumber: '+33-3-63-10-05-55',
      unreadCount: 0,
    },
  } as Record<string, Conversation>,
  messages: {
    first: {
      content: 'Hello',
      authorId: 'alice',
      timestamp: 1671990020697,
      attachments: [],
      status: 'read',
    },
    second: {
      content: 'Hey!',
      authorId: 'bob',
      timestamp: 1671990029093,
      attachments: [
        {
          type: 'image/png',
          url: 'https://nodejs.org/static/images/logo-hexagon-card.png',
        },
      ],
      status: 'sent',
    },
  } as Record<string, Message>,
};

export const clearedUnreadCount = produce(initial, (state) => {
  if (state.conversations['alice']) {
    state.conversations['alice'].unreadCount = 0;
  }
});

export const readMessage = produce(initial, (state) => {
  if (state.messages['second']) {
    state.messages['second'].status = 'read';
  }
});

export function formatMessage(
  message: Message | undefined,
  state: typeof initial,
) {
  if (!message) {
    return undefined;
  }

  const { content, authorId, timestamp, attachments, status } = message;

  // Note that we never read "unreadCount"
  const author = state.conversations[authorId];
  return {
    content,
    author: author ? `${author.title} (${author.phoneNumber})` : '<unknown>',
    timestamp,
    attachments,
    status,
  };
}
