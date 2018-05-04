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

  function submitForm(ev) {
    var j = i;
    i += 1;
    steps[j].submit(ev);
  }
  $qsa('.js-acme-form').forEach(function ($el) {
    $el.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submitForm(ev);
    });
  });
  function updateChallengeType() {
    var input = this || $qs('.js-acme-challenge-type');
    console.log('ch type radio:', input.value);
    $qs('.js-acme-table-wildcard').hidden = true;
    $qs('.js-acme-table-http-01').hidden = true;
    $qs('.js-acme-table-dns-01').hidden = true;
    if (info.challenges.wildcard) {
      $qs('.js-acme-table-wildcard').hidden = false;
    }
    if (info.challenges[input.value]) {
      $qs('.js-acme-table-' + input.value).hidden = false;
    }
  }
  $qsa('.js-acme-challenge-type').forEach(function ($el) {
    $el.addEventListener('change', updateChallengeType);
  });

  steps[1] = function () {
    hideForms();
    $qs('.js-acme-form-domains').hidden = false;
  };
  steps[1].submit = function () {
    info.identifiers = $qs('.js-acme-domains').value.split(/\s*,\s*/g).map(function (hostname) {
      return { type: 'dns', value: hostname.toLowerCase().trim() };
    });
    info.identifiers.sort(function (a, b) {
      if (a === b) { return 0; }
      if (a < b) { return 1; }
      if (a > b) { return -1; }
    });

    return BACME.directory($qs('.js-acme-directory-url').value).then(function (directory) {
      $qs('.js-acme-tos-url').href = directory.meta.termsOfService;
      return BACME.nonce().then(function (_nonce) {
        nonce = _nonce;

        console.log("MAGIC STEP NUMBER in 1 is:", i);
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
      info.jwk = jwk;
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
        info.kid = kid;
        return BACME.orders.sign({
          jwk: jwk
        , identifiers: info.identifiers
        , kid: kid
        }).then(function (signedOrder) {
          return BACME.orders.create({
            signedOrder: signedOrder
          }).then(function (order) {
            info.finalizeUrl = order.finalize;
            info.orderUrl = order.url; // from header Location ???
            return BACME.thumbprint({ jwk: jwk }).then(function (thumbprint) {
              return BACME.challenges.all().then(function (claims) {
                console.log('claims:');
                console.log(claims);
                var obj = { 'dns-01': [], 'http-01': [], 'wildcard': [] };
                var map = {
                  'http-01': '.js-acme-table-http-01'
                , 'dns-01': '.js-acme-table-dns-01'
                , 'wildcard': '.js-acme-table-wildcard'
                }
                var tpls = {};
                info.challenges = obj;
                Object.keys(map).forEach(function (k) {
                  var sel = map[k] + ' tbody';
                  console.log(sel);
                  tpls[k] = $qs(sel).innerHTML;
                  $qs(map[k] + ' tbody').innerHTML = '';
                });

                // TODO make Promise-friendly
                return Promise.all(claims.map(function (claim) {
                  var hostname = claim.identifier.value;
                  return Promise.all(claim.challenges.map(function (c) {
                    var keyAuth = BACME.challenges['http-01']({
                      token: c.token
                    , thumbprint: thumbprint
                    , challengeDomain: hostname
                    });
                    return BACME.challenges['dns-01']({
                      keyAuth: keyAuth.value
                    , challengeDomain: hostname
                    }).then(function (dnsAuth) {
                      var data = {
                        type: c.type
                      , hostname: hostname
                      , url: c.url
                      , token: c.token
                      , keyAuthorization: keyAuth
                      , httpPath: keyAuth.path
                      , httpAuth: keyAuth.value
                      , dnsType: dnsAuth.type
                      , dnsHost: dnsAuth.host
                      , dnsAnswer: dnsAuth.answer
                      };

                      obj[c.type].push(data);
                      console.log('');
                      console.log('CHALLENGE');
                      console.log(claim);
                      console.log(c);
                      console.log(data);
                      console.log('');

                      if (claim.wildcard) {
                        obj.wildcard.push(data);
                        $qs(map.wildcard).innerHTML += '<tr><td>' + data.hostname + '</td><td>' + data.dnsHost + '</td><td>' + data.dnsAnswer + '</td></tr>';
                      } else {
                        obj[data.type].push(data);
                        if ('dns-01' === data.type) {
                          $qs(map[data.type]).innerHTML += '<tr><td>' + data.hostname + '</td><td>' + data.dnsHost + '</td><td>' + data.dnsAnswer + '</td></tr>';
                        } else if ('http-01' === data.type) {
                          $qs(map[data.type]).innerHTML += '<tr><td>' + data.hostname + '</td><td>' + data.httpPath + '</td><td>' + data.httpAuth + '</td></tr>';
                        } else {
                          throw new Error('Unexpected type: ' + data.type);
                        }
                      }

                    });

                  }));
                })).then(function () {

                  // hide wildcard if no wildcard
                  // hide http-01 and dns-01 if only wildcard
                  if (!obj.wildcard.length) {
                    $qs('.js-acme-wildcard').hidden = true;
                  }
                  if (!obj['http-01'].length) {
                    $qs('.js-acme-challenges').hidden = true;
                  }

                  updateChallengeType();

                  console.log("MAGIC STEP NUMBER in 2 is:", i);
                  steps[i]();
                });

              });
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
  steps[3].submit = function () {
    // for now just show the next page immediately (its a spinner)
    console.log("MAGIC STEP NUMBER is:", i);

    var chType;
    Array.prototype.some.call($qsa('.js-acme-challenge-type'), function ($el) {
      if ($el.checked) {
        chType = $el.value;
        return true;
      }
    });
    console.log('chType is:', chType);
    var chs = [];

    // do each wildcard, if any
    // do each challenge, by selected type only
    [ 'wildcard', chType].forEach(function (typ) {
      info.challenges[typ].forEach(function (ch) {
        // { jwk, challengeUrl, accountId (kid) }
        chs.push({
          jwk: info.jwk
        , challengeUrl: ch.url
        , accountId: info.kid
        });
      });
    });

    var results = [];
    function nextChallenge() {
      var ch = chs.pop();
      if (!ch) { return results; }
      return BACME.challenges.accept(ch).then(function (result) {
        results.push(result);
        return nextChallenge();
      });
    }

    steps[i]();
    return nextChallenge().then(function (results) {
      console.log('challenge status:', results);
      var polls = results.slice(0);
      var allsWell = true;

      function checkPolls() {
        return new Promise(function (resolve) {
          setTimeout(resolve, 1000);
        }).then(function () {
          return Promise.all(polls.map(function (poll) {
            return BACME.challenges.check({ challengePollUrl: poll.url });
          })).then(function (polls) {
            console.log(polls);

            polls = polls.filter(function (poll) {
              //return 'valid' !== poll.status && 'invalid' !== poll.status;
              if ('pending' === poll.status) {
                return true;
              }
              if ('valid' !== poll.status) {
                allsWell = false;
                console.warn('BAD POLL STATUS', poll);
              }
              // TODO show status in HTML
            });

            if (polls.length) {
              return checkPolls();
            }
            return true;
          });
        });
      }

      return checkPolls().then(function () {
        if (allsWell) {
          return submitForm();
        }
      });
    });
  };

  // spinner
  steps[4] = function () {
    hideForms();
    $qs('.js-acme-form-poll').hidden = false;
  }
  steps[4].submit = function () {
    console.log('Congrats! Auto advancing...');
    var key = info.identifiers.map(function (ident) { return ident.value; }).join(',');
    var serverJwk = JSON.parse(localStorage.getItem('server:' + key) || 'null');
    var p;

    function createKeypair() {
      return BACME.accounts.generateKeypair({
        type: 'ECDSA'
      , bitlength: '256'
      }).then(function (serverJwk) {
        localStorage.setItem('server:' + key, JSON.stringify(serverJwk));
        return serverJwk;
      })
    }

    if (serverJwk) {
      p = Promise.resolve(serverJwk);
    } else {
      p = createKeypair();
    }

    return p.then(function (_serverJwk) {
      serverJwk = _serverJwk;
      // { serverJwk, domains }
      return BACME.orders.generateCsr({
        serverJwk: serverJwk
      , domains: info.identifiers.map(function (ident) {
          return ident.value;
        })
      }).then(function (csrweb64) {
        return BACME.order.finalize({
          csr: csrweb64
        , jwk: info.jwk
        , finalizeUrl: info.finalizeUrl
        , accountId: info.kid
        });
      }).then(function () {
        function checkCert() {
          return new Promise(function (resolve) {
            setTimeout(resolve, 1000);
          }).then(function () {
            return BACME.order.check({ orderUrl: info.orderUrl });
          }).then(function (reply) {
            if ('processing' === reply) {
              return checkCert();
            }
            return reply;
          });
        }

        return checkCert();
      }).then(function (reply) {
        return BACME.order.receive({ certificateUrl: reply.certificate });
      }).then(function (certs) {
        console.log('WINNING!');
        console.log(certs);
      });
    });
  };

  steps[5] = function () {
    hideForms();
    $qs('.js-acme-form-download').hidden = false;
  }

  steps[1]();
}());
