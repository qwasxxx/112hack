import type { Plugin } from 'vite';

export function encodeFsPlugin(): Plugin {
  return {
    name: 'encode-at-fs-urls',
    transform(code) {
      if (!code.includes('/@fs/')) {
        return null;
      }
      return code.replace(/\/@fs\/([^"'\\]+)/g, (_match, filePath: string) => `/@fs/${encodeURI(filePath)}`);
    },
  };
}
