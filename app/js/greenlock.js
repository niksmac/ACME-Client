(function () {
'use strict';

  /*global URLSearchParams,Headers*/
  var PromiseA = window.Promise;
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
  var info = {};
  var steps = {};
  var i = 1;
  var apiUrl = 'https://acme-{{env}}.api.letsencrypt.org/directory';

  // fix previous browsers
  var isCurrent = (localStorage.getItem('version') === VERSION);
  if (!isCurrent) {
    localStorage.clear();
    localStorage.setItem('version', VERSION);
  }
  localStorage.setItem('version', VERSION);

  var challenges = {
    'http-01': {
      set: function (auth) {
        console.log('Chose http-01 for', auth.altname, auth);
        return Promise.resolve();
      }
    , remove: function (auth) {
        console.log('Can remove http-01 for', auth.altname, auth);
        return Promise.resolve();
      }
    }
  , 'dns-01': {
      set: function (auth) {
        console.log('Chose dns-01 for', auth.altname, auth);
        return Promise.resolve();
      }
    , remove: function (auth) {
        console.log('Can remove dns-01 for', auth.altname, auth);
        return Promise.resolve();
      }
    }
  };

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
      var ourfault = true;
      console.error(err);
      console.error(Object.keys(err));
      if ('E_CHALLENGE_INVALID' === err.code) {
        if ('dns-01' === err.type) {
          ourfault = false;
          window.alert("It looks like the DNS record you set for "
            + err.altname + " was incorrect or did not propagate. "
            + "The error message was '" + err.message + "'");
        } else if ('http-01' === err.type) {
          ourfault = false;
          window.alert("It looks like the file you uploaded for "
            + err.altname + " was incorrect or could not be downloaded. "
            + "The error message was '" + err.message + "'");
        }
      }

      if (ourfault) {
        err.auth = undefined;
        window.alert("Something went wrong. It's probably our fault, not yours."
          + " Please email aj@rootprojects.org to let him know. The error message is: \n"
          + JSON.stringify(err, null, 2));
      }
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
    info.domains = $qs('.js-acme-domains').value.replace(/https?:\/\//g, ' ').replace(/[,+]/g, ' ').trim().split(/\s+/g);
    info.identifiers = info.domains.map(function (hostname) {
      return { type: 'dns', value: hostname.toLowerCase().trim() };
    });
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

    info.email = email;
    info.contact = [ 'mailto:' + email ];
    info.agree = $qs('.js-acme-account-tos').checked;
    //info.greenlockAgree = $qs('.js-gl-tos').checked;
    info.domains = info.identifiers.map(function (ident) { return ident.value; });
    console.log("domains:");
    console.log(info.domains);

    // TODO ping with version and account creation
    setTimeout(saveContact, 100, email, info.domains);

		function checkTos(tos) {
			if (info.agree) {
				return tos;
			} else {
				return '';
			}
		}

    $qs('.js-account-next').disabled = true;

    return getAccountKeypair(email).then(function (jwk) {
      // TODO save account id rather than always retrieving it?
			return acme.accounts.create({
				email: email
			, agreeToTerms: checkTos
			, accountKeypair: { privateKeyJwk: jwk }
			}).then(function (account) {
				console.log("account created result:", account);
				info.account = account;
				info.privateJwk = jwk;
				info.email = email;
				info.acme = acme; // TODO XXX remove
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
      var jwk = info.privateJwk;
      var account = info.account;

			return acme.orders.request({
			  account: account
			, accountKeypair: { privateKeyJwk: jwk }
			, domains: info.domains
      , challenges: challenges
			}).then(function (order) {
        info.order = order;

        var claims = order.claims;
        console.log('claims:');
        console.log(claims);

        var obj = { 'dns-01': [], 'http-01': [], 'wildcard': [] };
        info.challenges = obj;
        /*
        var map = {
          'http-01': '.js-acme-verification-http-01'
        , 'dns-01': '.js-acme-verification-dns-01'
        , 'wildcard': '.js-acme-verification-wildcard'
        };
        */
        var $httpList = $qs('.js-acme-http');
        var $dnsList = $qs('.js-acme-dns');
        var $wildList = $qs('.js-acme-wildcard');
        var httpTpl = $httpList.innerHTML;
        var dnsTpl = $dnsList.innerHTML;
        var wildTpl = $wildList.innerHTML;
        $httpList.innerHTML = '';
        $dnsList.innerHTML = '';
        $wildList.innerHTML = '';

        claims.forEach(function (claim) {
          console.log("Challenge (claim):");
          console.log(claim);
          var hostname = claim.identifier.value;
          claim.challenges.forEach(function (c) {
            var auth = c;
            var data = {
              type: c.type
            , hostname: hostname
            , url: c.url
            , token: c.token
            , httpPath: auth.challengeUrl
            , httpAuth: auth.keyAuthorization
            , dnsType: 'TXT'
            , dnsHost: auth.dnsHost
            , dnsAnswer: auth.keyAuthorizationDigest
            };

            console.log('');
            console.log('CHALLENGE');
            console.log(claim);
            console.log(c);
            console.log(data);
            console.log('');

            var verification = document.createElement("div");
            if (claim.wildcard) {
              obj.wildcard.push(data);
              verification.innerHTML = wildTpl;
              //verification.querySelector(".js-acme-ver-hostname").innerHTML = data.hostname;
              verification.querySelector(".js-acme-ver-txt-host").innerHTML = data.dnsHost;
              verification.querySelector(".js-acme-ver-txt-value").innerHTML = data.dnsAnswer;
              $wildList.appendChild(verification);
            } else if(obj[data.type]) {

              obj[data.type].push(data);

              if ('dns-01' === data.type) {
                verification.innerHTML = dnsTpl;
                //verification.querySelector(".js-acme-ver-hostname").innerHTML = data.hostname;
                verification.querySelector(".js-acme-ver-txt-host").innerHTML = data.dnsHost;
                verification.querySelector(".js-acme-ver-txt-value").innerHTML = data.dnsAnswer;
                $dnsList.appendChild(verification);
              } else if ('http-01' === data.type) {
                verification.innerHTML = httpTpl;
                verification.querySelector(".js-acme-ver-file-location").innerHTML = data.httpPath.split("/").slice(-1);
                verification.querySelector(".js-acme-ver-content").innerHTML = data.httpAuth;
                verification.querySelector(".js-acme-ver-uri").innerHTML = data.httpPath;
                verification.querySelector(".js-download-verify-link").href =
                  "data:text/octet-stream;base64," + window.btoa(data.httpAuth);
                verification.querySelector(".js-download-verify-link").download = data.httpPath.split("/").slice(-1);
                $httpList.appendChild(verification);
              }
            }
          });
        });

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
    }).catch(function (err) {
      console.error('Step \'\' Error:');
      console.error(err, err.stack);
      window.alert("An error happened (but it's not your fault)."
        + " Email aj@rootprojects.org to let him know that 'order and get challenges' failed.");
    });
  };

  steps[3] = function () {
    updateProgress(1);
    hideForms();
    $qs('.js-acme-form-challenges').hidden = false;
  };
  steps[3].submit = function () {
    var challengePriority = [ 'dns-01' ];
    if ('http-01' === $qs('.js-acme-challenge-type:checked').value) {
      challengePriority.unshift('http-01');
    }
    console.log('primary challenge type is:', challengePriority[0]);

    steps[i]();
    return getAccountKeypair(info.email).then(function (jwk) {
      // for now just show the next page immediately (its a spinner)
      // TODO put a test challenge in the list
      // TODO warn about wait-time if DNS
		  return getServerKeypair().then(function (serverJwk) {
        return acme.orders.complete({
          account: info.account
        , accountKeypair: { privateKeyJwk: jwk }
        , order: info.order
        , domains: info.domains
        , domainKeypair: { privateKeyJwk: serverJwk }
        , challengePriority: challengePriority
        , challenges: challenges
        }).then(function (certs) {
          return Keypairs.export({ jwk: serverJwk }).then(function (keyPem) {
            console.log('WINNING!');
            console.log(certs);
            $qs('#js-fullchain').innerHTML = [
              certs.cert.trim() + "\n"
            , certs.chain + "\n"
            ].join("\n");
            $qs("#js-download-fullchain-link").href =
              "data:text/octet-stream;base64," + window.btoa(certs);

            $qs('#js-privkey').innerHTML = keyPem;
            $qs("#js-download-privkey-link").href =
              "data:text/octet-stream;base64," + window.btoa(keyPem);
            submitForm();
          });
        });
      });
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

    steps[i]();
  };

  steps[5] = function () {
    updateProgress(2);
    hideForms();
    $qs('.js-acme-form-download').hidden = false;
  };

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

  if (params.has('acme-domains')) {
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

  // The kickoff
  steps[1]();

  return testKeypairSupport().then(function (rsaSupport) {
    if (rsaSupport) {
      return true;
    }

    return testEcdsaSupport().then(function () {
      console.info('[crypto] ECDSA is supported');
    }).catch(function (err) {
      console.error('[crypto] could not use either RSA nor EC.');
      console.error(err);
      window.alert("Generating secure certificates requires a browser with cryptography support."
				+ "Please consider a recent version of Chrome, Firefox, or Safari.");
			throw err;
    });
  });
}());
