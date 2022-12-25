import { watch } from '../src';
import { initial, readMessage, formatMessage } from './data';

const { proxy, watcher } = watch(initial);
watcher.unwrap(formatMessage(proxy.messages['second'], proxy));
watcher.stop();

export const name = 'isChanged';

export default () => {
  const changed = watcher.isChanged(initial, readMessage);

  return changed ? 1 : 0;
};
