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
    // Briefly lay the content out like the printed sheet (see `.capturing` in styles.css).
    node.classList.add('capturing');
    try {
      const blob = await toBlob(node, {
        // The sheet is captured at printed-page width, so render at 3× to keep the picture sharp.
        pixelRatio: 3,
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
