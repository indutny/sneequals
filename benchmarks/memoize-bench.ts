import { memoize } from '../src/';
import { initial, clearedUnreadCount, formatMessage } from './data';

const fn = memoize(formatMessage);

export const name = 'memoize';

let i = 0;

export default () => {
  const state = i++ % 2 === 0 ? initial : clearedUnreadCount;
  return fn(state.messages['second'], state) ? 1 : 0;
};
