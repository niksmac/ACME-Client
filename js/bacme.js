(function (exports) {
'use strict';

var BACME = exports.BACME = {};
var webFetch = exports.fetch;
var webCrypto = exports.crypto;

var directoryUrl = 'https://acme-staging-v02.api.letsencrypt.org/directory';
var directory;

var nonceUrl;
var nonce;

var accountKeypair;
var accountJwk;

var accountUrl;
var signedAccount;

BACME.challengePrefixes = {
  'http-01': '/.well-known/acme-challenge'
, 'dns-01': '_acme-challenge'
};

BACME._logHeaders = function (resp) {
	console.log('Headers:');
	Array.from(resp.headers.entries()).forEach(function (h) { console.log(h[0] + ': ' + h[1]); });
};

BACME._logBody = function (body) {
	console.log('Body:');
	console.log(JSON.stringify(body, null, 2));
	console.log('');
};

BACME.directory = function (url) {
	return webFetch(directoryUrl, { mode: 'cors' }).then(function (resp) {
		BACME._logHeaders(resp);
		return resp.json().then(function (body) {
			directory = body;
      nonceUrl = directory.newNonce || 'https://acme-staging-v02.api.letsencrypt.org/acme/new-nonce';
      accountUrl = directory.newAccount || 'https://acme-staging-v02.api.letsencrypt.org/acme/new-account';
      orderUrl = directory.newOrder || "https://acme-staging-v02.api.letsencrypt.org/acme/new-order";
      BACME._logBody(body);
      return body;
		});
	});
};

BACME.nonce = function () {
	return webFetch(nonceUrl, { mode: 'cors' }).then(function (resp) {
    BACME._logHeaders(resp);
		nonce = resp.headers.get('replay-nonce');
		console.log('Nonce:', nonce);
		// resp.body is empty
		return resp.headers.get('replay-nonce');
	});
};

BACME.accounts = {};

// type = ECDSA
// bitlength = 256
BACME.accounts.generateKeypair = function (opts) {
  var wcOpts = {};

  // ECDSA has only the P curves and an associated bitlength
  if (/^EC/i.test(opts.type)) {
    wcOpts.name = 'ECDSA';
    if (/256/.test(opts.bitlength)) {
      wcOpts.namedCurve = 'P-256';
    }
  }

  // RSA-PSS is another option, but I don't think it's used for Let's Encrypt
  // I think the hash is only necessary for signing, not generation or import
  if (/^RS/i.test(opts.type)) {
    wcOpts.name = 'RSASSA-PKCS1-v1_5';
    wcOpts.modulusLength = opts.bitlength;
    if (opts.bitlength < 2048) {
      wcOpts.modulusLength = opts.bitlength * 8;
    }
    wcOpts.publicExponent = new Uint8Array([0x01, 0x00, 0x01]);
    wcOpts.hash = { name: "SHA-256" };
  }

	// https://github.com/diafygi/webcrypto-examples#ecdsa---generatekey
	var extractable = true;
	return webCrypto.subtle.generateKey(
		wcOpts
	, extractable
	, [ 'sign', 'verify' ]
	).then(function (result) {
		accountKeypair = result;

		return webCrypto.subtle.exportKey(
			"jwk"
		, result.privateKey
		).then(function (privJwk) {

			accountJwk = privJwk;
			console.log('private jwk:');
			console.log(JSON.stringify(privJwk, null, 2));

			return webCrypto.subtle.exportKey(
				"pkcs8"
			, result.privateKey
			).then(function (keydata) {
				console.log('pkcs8:');
				console.log(Array.from(new Uint8Array(keydata)));

        return privJwk;
        //return accountKeypair;
			});
		})
	});
};

// json to url-safe base64
BACME._jsto64 = function (json) {
	return btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

var textEncoder = new TextEncoder();

BACME._importKey = function (jwk) {
  var alg; // I think the 256 refers to the hash
  var wcOpts = {};
  var extractable = false;

  // ECDSA
  if (/^EC/i.test(jwk.kty)) {
    wcOpts.name = 'ECDSA';
    wcOpts.namedCurve = jwk.crv;
    alg = 'ES256';
  }

  // RSA
  if (/^RS/i.test(jwk.kty)) {
    wcOpts.name = 'RSASSA-PKCS1-v1_5';
    wcOpts.hash = { name: "SHA-256" };
    alg = 'RS256';
  }

  return window.crypto.subtle.importKey(
    "jwk"
  , jwk
	, wcOpts
  , extractable
  , [ "sign"/*, "verify"*/ ]
  ).then(function (keypair) {
    return {
      wcKey: keypair
    , meta: {
        alg: alg
      , name: wcOpts.name
      , hash: wcOpts.hash
      }
    , jwk: jwk
    };
  });
};
BACME._sign = function (opts) {
  var wcPrivKey = opts.abstractKey.wcKey;
  var wcOpts = opts.abstractKey.meta;
  var alg = opts.abstractKey.meta.alg; // I think the 256 refers to the hash
  var signHash;

  console.log('kty', opts.abstractKey.jwk.kty);
  signHash = { name: "SHA-" + alg.replace(/[a-z]+/ig, '') };

  var msg = textEncoder.encode(opts.protected64 + '.' + opts.payload64);
  console.log('msg:', msg);
  return window.crypto.subtle.sign(
    { name: wcOpts.name, hash: signHash }
  , wcPrivKey
  , msg
  ).then(function (signature) {
    //console.log('sig1:', signature);
    //console.log('sig2:', new Uint8Array(signature));
    //console.log('sig3:', Array.prototype.slice.call(new Uint8Array(signature)));
    // convert buffer to urlsafe base64
    var sig64 = btoa(Array.prototype.map.call(new Uint8Array(signature), function (ch) {
      return String.fromCharCode(ch);
    }).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    console.log('[1] URL-safe Base64 Signature:');
    console.log(sig64);

    var signedMsg = {
      protected: opts.protected64
    , payload: opts.payload64
    , signature: sig64
    };

    console.log('Signed Base64 Msg:');
    console.log(JSON.stringify(signedMsg, null, 2));

    return signedMsg;
  });
};
// email = john.doe@gmail.com
// jwk = { ... }
// agree = true
BACME.accounts.sign = function (opts) {

  return BACME._importKey(opts.jwk).then(function (abstractKey) {

    var payloadJson =
      { termsOfServiceAgreed: opts.agree
      , onlyReturnExisting: false
      , contact: opts.contacts || [ 'mailto:' + opts.email ]
      };
    console.log('payload:');
    console.log(payloadJson);
    var payload64 = BACME._jsto64(
      payloadJson
    );

    // TODO RSA
    var protectedJson =
      { nonce: opts.nonce
      , url: accountUrl
      , alg: abstractKey.meta.alg
      , jwk: {
          kty: opts.jwk.kty
        , crv: opts.jwk.crv
        , x: opts.jwk.x
        , y: opts.jwk.y
        }
      };
    console.log('protected:');
    console.log(protectedJson);
    var protected64 = BACME._jsto64(
      protectedJson
    );

		// Note: this function hashes before signing so send data, not the hash
		return BACME._sign({
      abstractKey: abstractKey
    , payload64: payload64
    , protected64: protected64
    });
  });
};

var account;
var accountId;

BACME.accounts.set = function (opts) {
	nonce = null;
	return window.fetch(accountUrl, {
		mode: 'cors'
	, method: 'POST'
	, headers: { 'Content-Type': 'application/jose+json' }
	, body: JSON.stringify(opts.signedAccount)
	}).then(function (resp) {
		BACME._logHeaders(resp);
		nonce = resp.headers.get('replay-nonce');
		accountId = resp.headers.get('location');
		console.log('Next nonce:', nonce);
		console.log('Location/kid:', accountId);

		if (!resp.headers.get('content-type')) {
		 console.log('Body: <none>');

		 return { kid: accountId };
		}

		return resp.json().then(function (result) {
      if (/^Error/i.test(result.detail)) {
        return Promise.reject(new Error(result.detail));
      }
      result.kid = accountId;
      BACME._logBody(result);

      return result;
		});
	});
};

var orderUrl;
var signedOrder;

BACME.orders = {};

// identifiers = [ { type: 'dns', value: 'example.com' }, { type: 'dns', value: '*.example.com' } ]
// signedAccount
BACME.orders.sign = function (opts) {
	var payload64 = BACME._jsto64({ identifiers: opts.identifiers });

	var protected64 = BACME._jsto64(
		{ nonce: nonce, alg: 'ES256', url: orderUrl, kid: opts.kid }
	);

	return BACME._importKey(opts.jwk).then(function (abstractKey) {
    console.log('abstractKey:');
    console.log(abstractKey);
    return BACME._sign({
      abstractKey: abstractKey
    , payload64: payload64
    , protected64: protected64
    }).then(function (sig) {
      if (!sig) {
        throw new Error('sig is undefined... nonsense!');
      }
      console.log('newsig', sig);
      return sig;
    });
  });
};

var order;
var currentOrderUrl;
var authorizationUrls;
var finalizeUrl;

BACME.orders.create = function (opts) {
	nonce = null;
	return window.fetch(orderUrl, {
		mode: 'cors'
	, method: 'POST'
	, headers: { 'Content-Type': 'application/jose+json' }
	, body: JSON.stringify(opts.signedOrder)
	}).then(function (resp) {
    BACME._logHeaders(resp);
		currentOrderUrl = resp.headers.get('location');
		nonce = resp.headers.get('replay-nonce');
		console.log('Next nonce:', nonce);

		return resp.json().then(function (result) {
      if (/^Error/i.test(result.detail)) {
        return Promise.reject(new Error(result.detail));
      }
			authorizationUrls = result.authorizations;
			finalizeUrl = result.finalize;
      BACME._logBody(result);

      return result;
		});
	});
};

BACME.challenges = {};
BACME.challenges.all = function () {
  var challenges = [];

  function next() {
    if (!authorizationUrls.length) {
      return challenges;
    }

    return BACME.challenges.view().then(function (challenge) {
      challenges.push(challenge);
      return next();
    });
  }

  return next();
};
BACME.challenges.view = function () {
	var authzUrl = authorizationUrls.pop();
	var token;
	var challengeDomain;
	var challengeUrl;

	return window.fetch(authzUrl, {
		mode: 'cors'
	}).then(function (resp) {
    BACME._logHeaders(resp);

		return resp.json().then(function (result) {
			// Note: select the challenge you wish to use
			var challenge = result.challenges.slice(0).pop();
			token = challenge.token;
			challengeUrl = challenge.url;
			challengeDomain = result.identifier.value;

      BACME._logBody(result);

      return { token: challenge.token, url: challenge.url, domain: result.identifier.value, challenges: result.challenges };
		});
	});
};

var thumbprint;
var keyAuth;
var httpPath;
var dnsAuth;
var dnsRecord;

BACME.thumbprint = function (opts) {
	// https://stackoverflow.com/questions/42588786/how-to-fingerprint-a-jwk

  var accountJwk = opts.jwk;
  var keys;

  if (/^EC/i.test(opts.jwk.kty)) {
    keys = [ 'e', 'kty', 'n' ];
  } else if (/^RS/i.test(opts.jwk.kty)) {
    keys = [ 'crv', 'kty', 'x', 'y' ];
  }

	var accountPublicStr = '{' + keys.map(function (key) {
		return '"' + key + '":"' + accountJwk[key] + '"';
	}).join(',') + '}';

	return window.crypto.subtle.digest(
		{ name: "SHA-256" } // SHA-256 is spec'd, non-optional
	, textEncoder.encode(accountPublicStr)
	).then(function(hash){
		thumbprint = btoa(Array.prototype.map.call(new Uint8Array(hash), function (ch) {
			return String.fromCharCode(ch);
		}).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

		console.log('Thumbprint:');
		console.log(thumbprint);

    return thumbprint;
	});
};

BACME.challenges['http-01'] = function () {
	// The contents of the key authorization file
	keyAuth = token + '.' + thumbprint;

	// Where the key authorization file goes
	httpPath = 'http://' + challengeDomain + '/.well-known/acme-challenge/' + token;

  console.log("echo '" + keyAuth + "' > '" + httpPath + "'");

  return {
    path: httpPath
  , value: keyAuth
  };
};

BACME.challenges['dns-01'] = function () {
	return window.crypto.subtle.digest(
		{ name: "SHA-256", }
	, textEncoder.encode(keyAuth)
	).then(function(hash){
		dnsAuth = btoa(Array.prototype.map.call(new Uint8Array(hash), function (ch) {
			return String.fromCharCode(ch);
		}).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

		dnsRecord = '_acme-challenge.' + challengeDomain;

		console.log('DNS TXT Auth:');
		// The name of the record
		console.log(dnsRecord);
		// The TXT record value
		console.log(dnsAuth);

    return {
      type: 'TXT'
    , host: dnsRecord
    , answer: dnsAuth
    };
	});
};

var challengePollUrl;

BACME.challenges.accept = function () {
  var payload64 = BACME._jsto64(
		{}
	);

	var protected64 = BACME._jsto64(
		{ nonce: nonce, alg: 'ES256', url: challengeUrl, kid: accountId }
	);

	nonce = null;
	return window.crypto.subtle.sign(
		{ name: "ECDSA", hash: { name: "SHA-256" } }
	, accountKeypair.privateKey
	, textEncoder.encode(protected64 + '.' + payload64)
	).then(function (signature) {

		var sig64 = btoa(Array.prototype.map.call(new Uint8Array(signature), function (ch) {
			return String.fromCharCode(ch);
		}).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

		var body = {
			protected: protected64
		, payload: payload64
		, signature: sig64
		};

		return window.fetch(
			challengeUrl
		, { mode: 'cors'
			, method: 'POST'
			, headers: { 'Content-Type': 'application/jose+json' }
			, body: JSON.stringify(body)
			}
		).then(function (resp) {
      BACME._logHeaders(resp);
			nonce = resp.headers.get('replay-nonce');

			return resp.json().then(function (reply) {
				challengePollUrl = reply.url;

				console.log('Challenge ACK:');
				console.log(JSON.stringify(reply));
			});
		});
	});
};

BACME.challenges.check = function () {
	return window.fetch(challengePollUrl, { mode: 'cors' }).then(function (resp) {
    BACME._logHeaders(resp);
		nonce = resp.headers.get('replay-nonce');

		return resp.json().then(function (reply) {
			challengePollUrl = reply.url;

      BACME._logBody(reply);

			return reply;
		});
	});
};

var domainKeypair;
var domainJwk;

BACME.domains = {};
// TODO factor out from BACME.accounts.generateKeypair
BACME.domains.generateKeypair = function () {
	var extractable = true;
	return window.crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" }
	, extractable
	, [ 'sign', 'verify' ]
	).then(function (result) {
		domainKeypair = result;

		return window.crypto.subtle.exportKey(
			"jwk"
		, result.privateKey
		).then(function (jwk) {

			domainJwk = jwk;
			console.log('private jwk:');
			console.log(JSON.stringify(jwk, null, 2));

      return domainKeypair;
		})
	});
};

BACME.orders.generateCsr = function (keypair, domains) {
  return Promise.resolve(CSR.generate(keypair, domains));
};

var certificateUrl;

BACME.orders.finalize = function () {
	var payload64 = BACME._jsto64(
		{ csr: csr }
	);

	var protected64 = BACME._jsto64(
		{ nonce: nonce, alg: 'ES256', url: finalizeUrl, kid: accountId }
	);

	nonce = null;
	return window.crypto.subtle.sign(
		{ name: "ECDSA", hash: { name: "SHA-256" } }
	, accountKeypair.privateKey
	, textEncoder.encode(protected64 + '.' + payload64)
	).then(function (signature) {

		var sig64 = btoa(Array.prototype.map.call(new Uint8Array(signature), function (ch) {
			return String.fromCharCode(ch);
		}).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

		var body = {
			protected: protected64
		, payload: payload64
		, signature: sig64
		};

		return window.fetch(
			finalizeUrl
		, { mode: 'cors'
			, method: 'POST'
			, headers: { 'Content-Type': 'application/jose+json' }
			, body: JSON.stringify(body)
			}
		).then(function (resp) {
      BACME._logHeaders(resp);
			nonce = resp.headers.get('replay-nonce');

			return resp.json().then(function (reply) {
				certificateUrl = reply.certificate;
        BACME._logBody(reply);
			});
		});
	});
};

}(window));
