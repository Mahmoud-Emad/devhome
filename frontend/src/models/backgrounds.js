// Wallpapers are the image files in src/assets/images. Vite bundles each one and
// hands back its hashed URL, so dropping a new image into that folder is enough
// to add it to the rotation.

const files = import.meta.glob('../assets/images/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Unsplash names files "first-last-<photoid>-unsplash.jpg"; turn that back into a
// readable photographer credit.
function creditFrom(path) {
  const name = path
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '');
  const parts = name.replace(/-unsplash$/, '').split('-');
  if (parts.length > 1) parts.pop(); // drop the photo id
  return parts.join(' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const backgrounds = Object.entries(files).map(([path, url]) => ({
  id: path
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, ''),
  author: creditFrom(path),
  url,
}));

export const byId = (id) => backgrounds.find((b) => b.id === id);
