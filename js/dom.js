export function getMount() {
  return document.getElementById('main-content') || document.querySelector('#main-content');
}

export function setMountContent(html = '') {
  const mount = getMount();
  if (mount) {
    mount.innerHTML = html;
  }
  return mount;
}
