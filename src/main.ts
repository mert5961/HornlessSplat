import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('App root was not found');
}

if (window.location.pathname === '/video-debug') {
  const { startVideoDebugApp } = await import('./videoDebugApp');
  startVideoDebugApp(root);
} else {
  const { startHornlessApp } = await import('./hornlessApp');
  await startHornlessApp(root);
}
