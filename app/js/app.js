(function () {
'use strict';

  var BROWSER_SUPPORTS_ECDSA = navigator.userAgent.toLowerCase().indexOf('firefox') === -1;
  var $qs = function (s) { return window.document.querySelector(s); };
  var $qsa = function (s) { return window.document.querySelectorAll(s); };
  var info = {};
  var steps = {};
  var nonce;
  var kid;
  var i = 1;

  var apiUrl = 'https://acme-{{env}}.api.letsencrypt.org/directory';
  function updateApiType() {
    console.log("type updated");
    var input = this || Array.prototype.filter.call(
      $qsa('.js-acme-api-type'), function ($el) { return $el.checked; }
    )[0];
    console.log('ACME api type radio:', input.value);
    $qs('.js-acme-directory-url').value = apiUrl.replace(/{{env}}/g, input.value);
  }
  $qsa('.js-acme-api-type').forEach(function ($el) {
    $el.addEventListener('change', updateApiType);
  });
  updateApiType();

  function hideForms() {
    $qsa('.js-acme-form').forEach(function (el) {
      el.hidden = true;
    });
  }

  function updateProgress(currentStep) {
    var progressSteps = $qs("#js-progress-bar").children;
    for(var j = 0; j < progressSteps.length; j++) {
      if(j < currentStep) {
        progressSteps[j].classList.add("js-progress-step-complete");
        progressSteps[j].classList.remove("js-progress-step-started");
      } else if(j === currentStep) {
        progressSteps[j].classList.remove("js-progress-step-complete");
        progressSteps[j].classList.add("js-progress-step-started");
      } else {
        progressSteps[j].classList.remove("js-progress-step-complete");
        progressSteps[j].classList.remove("js-progress-step-started");
      }
    };
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
    var input = this || Array.prototype.filter.call(
      $qsa('.js-acme-challenge-type'), function ($el) { return $el.checked; }
    )[0];
    console.log('ch type radio:', input.value);
    $qs('.js-acme-verification-wildcard').hidden = true;
    $qs('.js-acme-verification-http-01').hidden = true;
    $qs('.js-acme-verification-dns-01').hidden = true;
    if (info.challenges.wildcard) {
      $qs('.js-acme-verification-wildcard').hidden = false;
    }
    if (info.challenges[input.value]) {
      $qs('.js-acme-verification-' + input.value).hidden = false;
    }
  }
  $qsa('.js-acme-challenge-type').forEach(function ($el) {
    $el.addEventListener('change', updateChallengeType);
  });

  function saveContact(email, domains) {
    // to be used for good, not evil
    return window.fetch('https://api.ppl.family/api/ppl.family/public/list', {
      method: 'POST'
    , cors: true
    , headers: new Headers({ 'Content-Type': 'application/json' })
    , body: JSON.stringify({
        address: email
      , list: 'greenlock@ppl.family'
      , domain: domains.join(',')
      })
    }).then(function (resp) {
      return resp.json().then(function (data) {
        /*
        if (data.error) {
          window.alert("Couldn't save your contact. Email coolaj86@gmail.com instead.");
          return;
        }
        */
      });
    }).catch(function () {
      /*
      window.alert("Didn't get your contact. Bad network connection? Email coolaj86@gmail.com instead.");
      */
    });
  }

  steps[1] = function () {
    updateProgress(0);
    hideForms();
    $qs('.js-acme-form-domains').hidden = false;
  };
  steps[1].submit = function () {
    info.identifiers = $qs('.js-acme-domains').value.split(/\s*,\s*/g).map(function (hostname) {
      return { type: 'dns', value: hostname.toLowerCase().trim() };
    }).slice(0,1); //Disable multiple values for now.  We'll just take the first and work with it.
    info.identifiers.sort(function (a, b) {
      if (a === b) { return 0; }
      if (a < b) { return 1; }
      if (a > b) { return -1; }
    });

    return BACME.directory({ directoryUrl: $qs('.js-acme-directory-url').value }).then(function (directory) {
      $qs('.js-acme-tos-url').href = directory.meta.termsOfService;
      return BACME.nonce().then(function (_nonce) {
        nonce = _nonce;

        console.log("MAGIC STEP NUMBER in 1 is:", i);
        steps[i]();
      });
    });
  };

  steps[2] = function () {
    updateProgress(0);
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
    setTimeout(saveContact, 100, email, info.identifiers.map(function (ident) { return ident.value; }));

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
                info.challenges = obj;
                var map = {
                  'http-01': '.js-acme-verification-http-01'
                , 'dns-01': '.js-acme-verification-dns-01'
                , 'wildcard': '.js-acme-verification-wildcard'
                }

                /*
                var tpls = {};
                Object.keys(map).forEach(function (k) {
                  var sel = map[k] + ' tbody';
                  console.log(sel);
                  tpls[k] = $qs(sel).innerHTML;
                  $qs(map[k] + ' tbody').innerHTML = '';
                });
                */

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

                      console.log('');
                      console.log('CHALLENGE');
                      console.log(claim);
                      console.log(c);
                      console.log(data);
                      console.log('');

                      if (claim.wildcard) {
                        obj.wildcard.push(data);

                        $qs(map.wildcard).innerHTML += '<tr><td>' + data.hostname + '</td><td>' + data.dnsHost + '</td><td>' + data.dnsAnswer + '</td></tr>';
                      } else if(obj[data.type]) {

                        obj[data.type].push(data);

                        if ('dns-01' === data.type) {
                          $qs("#js-acme-ver-hostname").innerHTML = data.hostname;
                          $qs("#js-acme-ver-txt-host").innerHTML = data.dnsHost;
                          $qs("#js-acme-ver-txt-value").innerHTML = data.dnsAnswer;
                        } else if ('http-01' === data.type) {
                          $qs("#js-acme-ver-file-location").innerHTML = data.httpPath.split("/").slice(-1);
                          $qs("#js-acme-ver-content").innerHTML = data.httpAuth;
                          $qs("#js-acme-ver-uri").innerHTML = data.httpPath;
                          $qs("#js-download-verify-link").href =
                            "data:text/octet-stream;base64," + window.btoa(data.httpAuth);
                          $qs("#js-download-verify-link").download = data.httpPath.split("/").slice(-1);
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
      console.error(err, err.stack);
    });
  };

  steps[3] = function () {
    updateProgress(1);
    hideForms();
    $qs('.js-acme-form-challenges').hidden = false;
  };
  steps[3].submit = function () {
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
    console.log("INFO.challenges !!!!!", info.challenges);

    var results = [];
    function nextChallenge() {
      var ch = chs.pop();
      if (!ch) { return results; }
      return BACME.challenges.accept(ch).then(function (result) {
        results.push(result);
        return nextChallenge();
      });
    }

    // for now just show the next page immediately (its a spinner)
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
    updateProgress(1);
    hideForms();
    $qs('.js-acme-form-poll').hidden = false;
  }
  steps[4].submit = function () {
    console.log('Congrats! Auto advancing...');

    var key = info.identifiers.map(function (ident) { return ident.value; }).join(',');
    var serverJwk = JSON.parse(localStorage.getItem('server:' + key) || 'null');
    var p;

    function createKeypair() {
      let opts;

      if(BROWSER_SUPPORTS_ECDSA) {
        opts = {
          type: 'ECDSA'
        , bitlength: '256'
        };
      } else {
        opts = {
          type: 'RSA'
        , bitlength: '2048'
        };
      }

      return BACME.accounts.generateKeypair(opts).then(function (serverJwk) {
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
      info.serverJwk = serverJwk;
      // { serverJwk, domains }
      return BACME.orders.generateCsr({
        serverJwk: serverJwk
      , domains: info.identifiers.map(function (ident) {
          return ident.value;
        })
      }).then(function (csrweb64) {
        return BACME.orders.finalize({
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
            return BACME.orders.check({ orderUrl: info.orderUrl });
          }).then(function (reply) {
            if ('processing' === reply) {
              return checkCert();
            }
            return reply;
          });
        }

        return checkCert();
      }).then(function (reply) {
        return BACME.orders.receive({ certificateUrl: reply.certificate });
      }).then(function (certs) {
        console.log('WINNING!');
        console.log(certs);
        $qs('#js-fullchain').innerHTML = certs;
        $qs("#js-download-fullchain-link").href =
          "data:text/octet-stream;base64," + window.btoa(certs);

        // https://stackoverflow.com/questions/40314257/export-webcrypto-key-to-pem-format
				function spkiToPEM(keydata){
						var keydataS = arrayBufferToString(keydata);
						var keydataB64 = window.btoa(keydataS);
						var keydataB64Pem = formatAsPem(keydataB64);
						return keydataB64Pem;
				}

				function arrayBufferToString( buffer ) {
						var binary = '';
						var bytes = new Uint8Array( buffer );
						var len = bytes.byteLength;
						for (var i = 0; i < len; i++) {
								binary += String.fromCharCode( bytes[ i ] );
						}
						return binary;
				}


				function formatAsPem(str) {
						var finalString = '-----BEGIN ' + pemName + ' PRIVATE KEY-----\n';

						while(str.length > 0) {
								finalString += str.substring(0, 64) + '\n';
								str = str.substring(64);
						}

						finalString = finalString + '-----END ' + pemName + ' PRIVATE KEY-----';

						return finalString;
				}

        var wcOpts;
        var pemName;
        if (/^R/.test(info.serverJwk.kty)) {
          pemName = 'RSA';
          wcOpts = {
            name: "RSASSA-PKCS1-v1_5"
          , hash: { name: "SHA-256" }
          };
        } else {
          pemName = 'EC';
          wcOpts = {
            name: "ECDSA"
          , namedCurve: "P-256"
          }
        }
				return crypto.subtle.importKey(
          "jwk"
        , info.serverJwk
        , wcOpts
        , true
        , ["sign"]
				).then(function (privateKey) {
          return window.crypto.subtle.exportKey("pkcs8", privateKey);
				}).then (function (keydata) {
					var pem = spkiToPEM(keydata);
					$qs('#js-privkey').innerHTML = pem;
          $qs("#js-download-privkey-link").href =
            "data:text/octet-stream;base64," + window.btoa(pem);
          steps[i]();
        }).catch(function(err){
          console.error(err.toString());
				});
      });
    });
  };

  steps[5] = function () {
    updateProgress(2)
    hideForms();
    $qs('.js-acme-form-download').hidden = false;
  }
  steps[1]();

  var params = new URLSearchParams(window.location.search);
  var apiType = params.get('acme-api-type') || "staging-v02";

  if(params.has('acme-domains')) {
    console.log("acme-domains param: ", params.get('acme-domains'));
    $qs('.js-acme-domains').value = params.get('acme-domains');     

    $qsa('.js-acme-api-type').forEach(function(ele) {
      if(ele.value === apiType) {
        ele.checked = true;
      }
    });

    updateApiType();
    steps[2]();
    submitForm();
  }

  $qs('body').hidden = false;
}());
