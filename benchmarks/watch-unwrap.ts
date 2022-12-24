import { watch } from '../src';

export const name = 'watch+unwrap';

export default () => {
  const { proxy, watcher } = watch({ a: { b: [10, 20, 30] }, c: {} });
  const derived = watcher.unwrap({ num: proxy.a.b[2], c: proxy.c });
  watcher.stop();

  return derived.c ? derived.num ?? 0 : 0;
};
