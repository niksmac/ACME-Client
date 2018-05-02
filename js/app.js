(function () {
'use strict';

  var $qs = function (s) { return window.document.querySelector(s); };
  var $qsa = function (s) { return window.document.querySelectorAll(s); };
  var info = {};
  var steps = {};
  var nonce;
  var kid;
  var i = 1;

  //$qs('.js-acme-directory-url').value = 'https://acme-v02.api.letsencrypt.org/directory';
  $qs('.js-acme-directory-url').value = 'https://acme-staging-v02.api.letsencrypt.org/directory';

  function hideForms() {
    $qsa('.js-acme-form').forEach(function (el) {
      el.hidden = true;
    });
  }

  $qsa('.js-acme-form').forEach(function ($el) {
    $el.addEventListener('submit', function (ev) {
      ev.preventDefault();
      steps[i].submit(ev);
      i += 1;
    });
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
      return BACME.nonce().then(function (_nonce) {
        nonce = _nonce;

        steps[i]();
      });
    });
  };

  steps[2] = function () {
    hideForms();
    $qs('.js-acme-form-account').hidden = false;
  };
  steps[2].submit = function () {
    var email = $qs('.js-acme-account-email').value.toLowerCase().trim();

    info.contact = [ 'mailto:' + email ];
    info.agree = $qs('.js-acme-account-tos').checked;
    info.greenlockAgree = $qs('.js-gl-tos').checked;
    // TODO
    // options for
    // * regenerate key
    // * ECDSA / RSA / bitlength

    // TODO ping with version and account creation

    var jwk = JSON.parse(localStorage.getItem('account:' + email) || 'null');
    var p;

    function createKeypair() {
      return BACME.accounts.generateKeypair({
        type: 'ECDSA'
      , bitlength: '256'
      }).then(function (jwk) {
        localStorage.setItem('account:' + email, JSON.stringify(jwk));
        return jwk;
      })
    }

    if (jwk) {
      p = Promise.resolve(jwk);
    } else {
      p = createKeypair();
    }

    function createAccount(jwk) {
      console.log('account jwk:');
      console.log(jwk);
      delete jwk.key_ops;
      return BACME.accounts.sign({
        jwk: jwk
      , contacts: [ 'mailto:' + email ]
      , agree: info.agree
      , nonce: nonce
      , kid: kid
      }).then(function (signedAccount) {
        return BACME.accounts.set({
          signedAccount: signedAccount
        }).then(function (account) {
          console.log('account:');
          console.log(account);
          kid = account.kid;
          return kid;
        });
      });
    }

    return p.then(function (_jwk) {
      jwk = _jwk;
      kid = JSON.parse(localStorage.getItem('account-kid:' + email) || 'null');
      var p2

      // TODO save account id rather than always retrieving it
      if (kid) {
        p2 = Promise.resolve(kid);
      } else {
        p2 = createAccount(jwk);
      }

      return p2.then(function (_kid) {
        kid = _kid;
        return BACME.orders.sign({
          jwk: jwk
        , identifiers: info.identifiers
        , kid: kid
        }).then(function (signedOrder) {
          return BACME.orders.create({
            signedOrder: signedOrder
          }).then(function (/*challengeIndexes*/) {
            return BACME.challenges.all().then(function (challenges) {
              console.log('challenges:');
              console.log(challenges);
              // TODO populate challenges in table
              steps[i]();
            });
          });
        });
      });
    }).catch(function (err) {
      console.error('Step \'' + i + '\' Error:');
      console.error(err);
    });
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
