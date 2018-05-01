(function () {
'use strict';

  var $qs = function (s) { return window.document.querySelector(s); };
  var $qsa = function (s) { return window.document.querySelectorAll(s); };
  var info = {};
  var steps = {};
  var i = 1;

  //$qs('.js-acme-directory-url').value = 'https://acme-v02.api.letsencrypt.org/directory';
  $qs('.js-acme-directory-url').value = 'https://acme-staging-v02.api.letsencrypt.org/directory';

  function hideForms() {
    $qsa('.js-acme-form').forEach(function (el) {
      el.hidden = true;
    });
  }

  $qs('.js-acme-form-domains').addEventListener('submit', function (ev) {
    ev.preventDefault();
    steps[i].submit(ev);
    i += 1;
  });

  steps[1] = function () {
    hideForms();
    $qs('.js-acme-form-domains').hidden = false;
  };
  steps[1].submit = function () {
    info.identifiers = $qs('.js-acme-domains').value.split(/\s*,\s*/g).map(function (hostname) {
      return { type: 'dns', value: hostname.trim() };
    });

    return BACME.directory($qs('.js-acme-directory-url').value).then(function (directory) {
      $qs('.js-acme-tos-url').href = directory.meta.termsOfService;
      steps[i]();
    });
  };

  steps[2] = function () {
    hideForms();
    $qs('.js-acme-form-account').hidden = false;
  };
  steps[2].submit = function () {
    info.contact = [ 'mailto:' + $qs('.js-acme-account-email').value ];
    info.agree = $qs('.js-acme-account-tos').checked;
    info.greenlockAgree = $qs('.js-gl-tos').checked;
    // TODO
    // create account key
    // create account
    // capture email
    // submit challenges
    // populate challenges in table
    steps[i]();
  };

  steps[3] = function () {
    hideForms();
    $qs('.js-acme-form-challenges').hidden = false;
  };

  steps[4] = function () {
    hideForms();
    $qs('.js-acme-form-poll').hidden = false;
  }

  steps[5] = function () {
    hideForms();
    $qs('.js-acme-form-download').hidden = false;
  }

  steps[1]();
}());
