import { watch } from '../src';
import { initial, clearedUnreadCount, formatMessage } from './data';

const { proxy, watcher } = watch(initial);
watcher.unwrap(formatMessage(proxy.messages['second'], proxy));
watcher.stop();

export const name = 'isNotChanged';

export default () => {
  const notChanged = !watcher.isChanged(initial, clearedUnreadCount);

  return notChanged ? 1 : 0;
};
