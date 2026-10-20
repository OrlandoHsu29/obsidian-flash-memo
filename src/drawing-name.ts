export function drawingName(path: string): { name: string; extension: string } {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const extension = /\.excalidraw\.md$/i.test(filename) ? filename.slice(-14)
    : /\.excalidraw$/i.test(filename) ? filename.slice(-11)
    : /\.md$/i.test(filename) ? filename.slice(-3) : '';
  return { name: filename.slice(0, filename.length - extension.length), extension };
}

export function renamedDrawingPath(path: string, value: string): string {
  const name = value.trim();
  if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw Error('invalid-drawing-name');
  return path.slice(0, path.lastIndexOf('/') + 1) + name + drawingName(path).extension;
}
