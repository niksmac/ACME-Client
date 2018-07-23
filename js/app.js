(function () {
'use strict';

  var $qs = function (s) { return window.document.querySelector(s); };
  var $qsa = function (s) { return window.document.querySelectorAll(s); };

  var apiUrl = 'https://acme-{{env}}.api.letsencrypt.org/directory';
  function updateApiType() {
    var formData = new FormData($qs("#js-acme-form"));

    console.log('ACME api type radio:');

    var value = formData.get("acme-api-type");
    $qs('#js-acme-api-url').value = apiUrl.replace(/{{env}}/g, value);
  }
  $qs('#js-acme-form').addEventListener('change', updateApiType);

  updateApiType();
  try {
    document.fonts.load().then(function() {
      $qs('body').classList.add("js-app-ready");
    }).catch(function(error) {
      $qs('body').classList.add("js-app-ready");
    });
  } catch(e) {
    setTimeout(function() {$qs('body').classList.add("js-app-ready");}, 200);
  }
}());
