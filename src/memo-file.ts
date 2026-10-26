export type MemoType = 'sketch' | 'note';

export function memoType(path: string): MemoType {
  return /\.excalidraw(?:\.md)?$/i.test(path) ? 'sketch' : 'note';
}

export function memoViewState(path: string) {
  return {type: memoType(path) === 'sketch' ? 'excalidraw' : 'markdown',
    state: {file: path, ...(memoType(path) === 'note' ? {mode: 'source', source: false} : {})}, active: true};
}
