// Bootstrap's starter snippet for blocking submission of invalid forms. It lives
// here, not inline in the views, because script-src has no 'unsafe-inline' and
// the browser refuses inline script outright. Load it with
// <script src="/js/validateForms.js"></script> on any page whose form has
// class="validated-form".
//
// The inline copies this replaces queried `.needs-validation`, which the login
// and register forms never had — so on those pages it matched nothing even
// before the CSP started blocking it.
(() => {
  'use strict'

  // Fetch all the forms we want to apply custom Bootstrap validation styles to
  const forms = document.querySelectorAll('.validated-form')

  // Loop over them and prevent submission
  Array.from(forms).forEach(form => {
    form.addEventListener('submit', event => {
      if (!form.checkValidity()) {
        event.preventDefault()
        event.stopPropagation()
        // Bootstrap's was-validated styles only reach .form-control inputs, and
        // the login and register inputs are plain — without this, an empty
        // submit there is blocked with nothing on screen. The browser's own
        // "Please fill out this field" shows on every form.
        form.reportValidity()
      }

      form.classList.add('was-validated')
    }, false)
  })
})()
