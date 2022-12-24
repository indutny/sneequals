import { watch } from '../src';

const input = { a: { b: [10, 20, 30] } };
const { proxy, watcher } = watch(input);
watcher.unwrap({ c: proxy.a.b[2] });
watcher.stop();

export const name = 'isChanged';

export default () => {
  const notChanged = !watcher.isChanged(input, { a: { b: [30, 40, 30] } });

  const changed = watcher.isChanged(input, { a: { b: [30, 40, 50] } });

  return notChanged && changed ? 1 : 0;
};
