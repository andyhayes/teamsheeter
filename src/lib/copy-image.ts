import { toBlob } from 'html-to-image';

/**
 * Render an element to PNG and put it on the clipboard. Elements marked `.no-print`
 * (buttons, lock icons etc.) are left out. Falls back to downloading the PNG if the
 * browser won't write images to the clipboard.
 */
export async function copyElementImage(
  node: HTMLElement,
  filename: string,
  { padding = 0 }: { padding?: number } = {},
): Promise<'copied' | 'downloaded'> {
  const render = async () => {
    // Briefly let the content take its full width so a horizontally scrolled grid is captured whole.
    node.classList.add('capturing');
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        width: node.scrollWidth + padding * 2,
        height: node.scrollHeight + padding * 2,
        style: { padding: `${padding}px`, boxSizing: 'border-box', margin: '0' },
        skipFonts: true,
        filter: (el) => !(el instanceof HTMLElement && el.classList.contains('no-print')),
      });
      if (!blob) throw new Error('Could not render the team sheet');
      return blob;
    } finally {
      node.classList.remove('capturing');
    }
  };

  try {
    // Pass the promise straight to ClipboardItem so Safari keeps the click's permission.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': render() })]);
    return 'copied';
  } catch {
    const blob = await render();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    return 'downloaded';
  }
}
