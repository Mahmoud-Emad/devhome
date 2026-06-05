// Reusable copy-to-clipboard button. Pass a function returning the text to copy.

export function createCopyButton(getText, label = 'Copy') {
  const button = document.createElement('button');
  button.className = 'button-secondary copy-button';
  button.textContent = label;

  let resetTimer = null;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.textContent = label;
    }, 1500);
  });

  return button;
}
