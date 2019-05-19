(function () {
'use strict';

  /*global URLSearchParams,Headers*/
  var VERSION = '2';
	// ACME recommends ECDSA P-256, but RSA 2048 is still required by some old servers (like what replicated.io uses )
	// ECDSA P-384, P-521, and RSA 3072, 4096 are NOT recommend standards (and not properly supported)
  var BROWSER_SUPPORTS_RSA;
	var ECDSA_OPTS = { kty: 'EC', namedCurve: 'P-256' };
	var RSA_OPTS = { kty: 'RSA', modulusLength: 2048 };
  var Promise = window.Promise;
  var Keypairs = window.Keypairs;
  var ACME = window.ACME;
  var CSR = window.CSR;
  var $qs = function (s) { return window.document.querySelector(s); };
  var $qsa = function (s) { return window.document.querySelectorAll(s); };
	var acme;
	var accountStuff;
  var info = {};
  var steps = {};
  var i = 1;
  var apiUrl = 'https://acme-{{env}}.api.letsencrypt.org/directory';

  function updateApiType() {
    console.log("type updated");
    /*jshint validthis: true */
    var input = this || Array.prototype.filter.call(
      $qsa('.js-acme-api-type'), function ($el) { return $el.checked; }
    )[0];
    console.log('ACME api type radio:', input.value);
    $qs('.js-acme-directory-url').value = apiUrl.replace(/{{env}}/g, input.value);
  }

  function hideForms() {
    $qsa('.js-acme-form').forEach(function (el) {
      el.hidden = true;
    });
  }

  function updateProgress(currentStep) {
    var progressSteps = $qs("#js-progress-bar").children;
		var j;
    for (j = 0; j < progressSteps.length; j += 1) {
      if (j < currentStep) {
        progressSteps[j].classList.add("js-progress-step-complete");
        progressSteps[j].classList.remove("js-progress-step-started");
      } else if (j === currentStep) {
        progressSteps[j].classList.remove("js-progress-step-complete");
        progressSteps[j].classList.add("js-progress-step-started");
      } else {
        progressSteps[j].classList.remove("js-progress-step-complete");
        progressSteps[j].classList.remove("js-progress-step-started");
      }
    }
  }

  function submitForm(ev) {
    var j = i;
    i += 1;

    return PromiseA.resolve(steps[j].submit(ev)).catch(function (err) {
      console.error(err);
      window.alert("Something went wrong. It's our fault not yours. Please email aj@rootprojects.org and let him know that 'step " + j + "' failed.");
    });
  }

  function testEcdsaSupport() {
		/*
			var opts = {
				kty: $('input[name="kty"]:checked').value
			, namedCurve: $('input[name="ec-crv"]:checked').value
			, modulusLength: $('input[name="rsa-len"]:checked').value
			};
		*/
  }
  function testRsaSupport() {
		return Keypairs.generate(RSA_OPTS);
  }
  function testKeypairSupport() {
		// fix previous browsers
		var isCurrent = (localStorage.getItem('version') === VERSION);
		if (!isCurrent) {
			localStorage.clear();
			localStorage.setItem('version', VERSION);
		}
		localStorage.setItem('version', VERSION);

    return testRsaSupport().then(function () {
      console.info("[crypto] RSA is supported");
      BROWSER_SUPPORTS_RSA = true;
      return BROWSER_SUPPORTS_RSA;
    }).catch(function () {
      console.warn("[crypto] RSA is NOT fully supported");
      BROWSER_SUPPORTS_RSA = false;
      return BROWSER_SUPPORTS_RSA;
    });
  }

  function getServerKeypair() {
    var sortedAltnames = info.identifiers.map(function (ident) { return ident.value; }).sort().join(',');
    var serverJwk = JSON.parse(localStorage.getItem('server:' + sortedAltnames) || 'null');
    if (serverJwk) {
      return PromiseA.resolve(serverJwk);
    }

    var keypairOpts;
    // TODO allow for user preference
    if (BROWSER_SUPPORTS_RSA) {
      keypairOpts = RSA_OPTS;
    } else {
      keypairOpts = ECDSA_OPTS;
    }

    return Keypairs.generate(RSA_OPTS).catch(function (err) {
      console.error("[Error] Keypairs.generate(" + JSON.stringify(RSA_OPTS) + "):");
      throw err;
		}).then(function (pair) {
			localStorage.setItem('server:'+sortedAltnames, JSON.stringify(pair.private));
			return pair.private;
		});
  }

	function getAccountKeypair(email) {
		var json = localStorage.getItem('account:'+email);
		if (json) {
			return Promise.resolve(JSON.parse(json));
		}

		return Keypairs.generate(ECDSA_OPTS).catch(function (err) {
			console.warn("[Error] Keypairs.generate(" + JSON.stringify(ECDSA_OPTS) + "):\n", err);
			return Keypairs.generate(RSA_OPTS).catch(function (err) {
				console.error("[Error] Keypairs.generate(" + JSON.stringify(RSA_OPTS) + "):");
				throw err;
			});
		}).then(function (pair) {
			localStorage.setItem('account:'+email, JSON.stringify(pair.private));
			return pair.private;
		});
	}

  function updateChallengeType() {
    /*jshint validthis: true*/
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

  function saveContact(email, domains) {
    // to be used for good, not evil
    return window.fetch('https://api.rootprojects.org/api/rootprojects.org/public/community', {
      method: 'POST'
    , cors: true
    , headers: new Headers({ 'Content-Type': 'application/json' })
    , body: JSON.stringify({
        address: email
      , project: 'greenlock-domains@rootprojects.org'
			, timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone
      , domain: domains.join(',')
      })
    }).catch(function (err) {
      console.error(err);
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

		var acmeDirectoryUrl = $qs('.js-acme-directory-url').value;
		acme = ACME.create({ Keypairs: Keypairs, CSR: CSR });
		return acme.init(acmeDirectoryUrl).then(function (directory) {
      $qs('.js-acme-tos-url').href = directory.meta.termsOfService;
			console.log("MAGIC STEP NUMBER in 1 is:", i);
			steps[i]();
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
    //info.greenlockAgree = $qs('.js-gl-tos').checked;

    // TODO ping with version and account creation
    setTimeout(saveContact, 100, email, info.identifiers.map(function (ident) { return ident.value; }));

		function checkTos(tos) {
			if (info.agree) {
				return tos;
			} else {
				return '';
			}
		}

    return getAccountKeypair(email).then(function (jwk) {
      // TODO save account id rather than always retrieving it?
			return acme.accounts.create({
				email: email
			, agreeToTerms: checkTos
			, accountKeypair: { privateKeyJwk: jwk }
			}).then(function (account) {
				console.log("account created result:", account);
				accountStuff.account = account;
				accountStuff.privateJwk = jwk;
				accountStuff.email = email;
				accountStuff.acme = acme; // TODO XXX remove
			}).catch(function (err) {
				console.error("A bad thing happened:");
				console.error(err);
				window.alert(err.message || JSON.stringify(err, null, 2));
				return new Promise(function () {
 					// stop the process cold
					console.warn('TODO: resume at ask email?');
				});
			});
		}).then(function () {
      var jwk = accountStuff.privateJwk;
      var account = accountStuff.account;

			return acme.orders.create({
			  account: account
			, accountKeypair: { privateKeyJwk: jwk }
			, identifiers: info.identifiers
			}).then(function (order) {
				return acme.orders.create({
					signedOrder: signedOrder
				}).then(function (order) {
					accountStuff.order = order;
          var claims = order.challenges;
          console.log('claims:');
          console.log(claims);

          var obj = { 'dns-01': [], 'http-01': [], 'wildcard': [] };
          info.challenges = obj;
          var map = {
            'http-01': '.js-acme-verification-http-01'
          , 'dns-01': '.js-acme-verification-dns-01'
          , 'wildcard': '.js-acme-verification-wildcard'
          };
          options.challengePriority = [ 'http-01', 'dns-01' ];

          // TODO make Promise-friendly
          return PromiseA.all(claims.map(function (claim) {
            var hostname = claim.identifier.value;
            return PromiseA.all(claim.challenges.map(function (c) {
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
                  let verification = $qs(".js-acme-verification-wildcard");
                  verification.querySelector(".js-acme-ver-hostname").innerHTML = data.hostname;
                  verification.querySelector(".js-acme-ver-txt-host").innerHTML = data.dnsHost;
                  verification.querySelector(".js-acme-ver-txt-value").innerHTML = data.dnsAnswer;

                } else if(obj[data.type]) {

                  obj[data.type].push(data);

                  if ('dns-01' === data.type) {
                    let verification = $qs(".js-acme-verification-dns-01");
                    verification.querySelector(".js-acme-ver-hostname").innerHTML = data.hostname;
                    verification.querySelector(".js-acme-ver-txt-host").innerHTML = data.dnsHost;
                    verification.querySelector(".js-acme-ver-txt-value").innerHTML = data.dnsAnswer;
                  } else if ('http-01' === data.type) {
                    $qs(".js-acme-ver-file-location").innerHTML = data.httpPath.split("/").slice(-1);
                    $qs(".js-acme-ver-content").innerHTML = data.httpAuth;
                    $qs(".js-acme-ver-uri").innerHTML = data.httpPath;
                    $qs(".js-download-verify-link").href =
                      "data:text/octet-stream;base64," + window.btoa(data.httpAuth);
                    $qs(".js-download-verify-link").download = data.httpPath.split("/").slice(-1);
                  }
                }

              });

            }));
          })).then(function () {

            // hide wildcard if no wildcard
            // hide http-01 and dns-01 if only wildcard
            if (!obj.wildcard.length) {
              $qs('.js-acme-wildcard-challenges').hidden = true;
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
    }).catch(function (err) {
      console.error('Step \'\' Error:');
      console.error(err, err.stack);
      window.alert("An error happened at Step " + i + ", but it's not your fault. Email aj@rootprojects.org and let him know.");
    });
  };

  steps[3] = function () {
    updateProgress(1);
    hideForms();
    $qs('.js-acme-form-challenges').hidden = false;
  };
  steps[3].submit = function () {
    options.challengeTypes = [ 'dns-01' ];
    if ('http-01' === $qs('.js-acme-challenge-type:checked').value) {
      options.challengeTypes.unshift('http-01');
    }
    console.log('primary challenge type is:', options.challengeTypes[0]);

    return getAccountKeypair(email).then(function (jwk) {
      // for now just show the next page immediately (its a spinner)
      // TODO put a test challenge in the list
      // TODO warn about wait-time if DNS
      steps[i]();
		  return getServerKeypair().then(function () {
        return acme.orders.finalize({
          account: accountStuff.account
        , accountKeypair: { privateKeyJwk: jwk }
        , order: accountStuff.order
        , domainKeypair: 'TODO'
        });
      }).then(function (certs) {
        console.log('WINNING!');
        console.log(certs);
        $qs('#js-fullchain').innerHTML = certs;
        $qs("#js-download-fullchain-link").href =
          "data:text/octet-stream;base64," + window.btoa(certs);

        var wcOpts;
        var pemName;
        if (/^R/.test(info.serverJwk.kty)) {
          pemName = 'RSA';
          wcOpts = { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } };
        } else {
          pemName = 'EC';
          wcOpts = { name: "ECDSA", namedCurve: "P-256" };
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
          var pem = spkiToPEM(keydata, pemName);
          $qs('#js-privkey').innerHTML = pem;
          $qs("#js-download-privkey-link").href =
            "data:text/octet-stream;base64," + window.btoa(pem);
          steps[i]();
        });
      });
    }).then(function () {
      return submitForm();
    });
  };

  // spinner
  steps[4] = function () {
    updateProgress(1);
    hideForms();
    $qs('.js-acme-form-poll').hidden = false;
  };
  steps[4].submit = function () {
    console.log('Congrats! Auto advancing...');


    }).catch(function (err) {
      console.error(err.toString());
      window.alert("An error happened in the final step, but it's not your fault. Email aj@rootprojects.org and let him know.");
    });
  };

  steps[5] = function () {
    updateProgress(2);
    hideForms();
    $qs('.js-acme-form-download').hidden = false;
  };
  steps[1]();

  var params = new URLSearchParams(window.location.search);
  var apiType = params.get('acme-api-type') || "staging-v02";

  $qsa('.js-acme-api-type').forEach(function ($el) {
    $el.addEventListener('change', updateApiType);
  });

  updateApiType();

  $qsa('.js-acme-form').forEach(function ($el) {
    $el.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submitForm(ev);
    });
  });


  $qsa('.js-acme-challenge-type').forEach(function ($el) {
    $el.addEventListener('change', updateChallengeType);
  });

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

  return testKeypairSupport().then(function (rsaSupport) {
    if (rsaSupport) {
      return true;
    }

    return testRsaSupport().then(function () {
      console.info('[crypto] RSA is supported');
    }).catch(function (err) {
      console.error('[crypto] could not use either RSA nor EC.');
      console.error(err);
      window.alert("Generating secure certificates requires a browser with cryptography support."
				+ "Please consider a recent version of Chrome, Firefox, or Safari.");
			throw err;
    });
  });
}());
