// "Go Back" links. Replaces href="javascript:history.back()", which CSP blocks
// as an inline javascript: navigation. The href is a real fallback: it works
// with JS disabled, and when there is no history to go back to.
document.addEventListener('click', function (event) {
  const link = event.target.closest('[data-back]');
  if (!link) return;
  if (window.history.length > 1) {
    event.preventDefault();
    window.history.back();
  }
});
