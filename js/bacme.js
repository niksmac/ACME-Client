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
BACME.accounts.generateKeypair = function () {
	// https://github.com/diafygi/webcrypto-examples#ecdsa---generatekey
	var extractable = true;
	return webCrypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" }
	, extractable
	, [ 'sign', 'verify' ]
	).then(function (result) {
		accountKeypair = result;

		return webCrypto.subtle.exportKey(
			"jwk"
		, result.privateKey
		).then(function (jwk) {

			accountJwk = jwk;
			console.log('private jwk:');
			console.log(JSON.stringify(jwk, null, 2));

			return webCrypto.subtle.exportKey(
				"pkcs8"
			, result.privateKey
			).then(function (keydata) {
				console.log('pkcs8:');
				console.log(Array.from(new Uint8Array(keydata)));

        return accountKeypair;
			});
		})
	});
};

// json to url-safe base64
BACME._jsto64 = function (json) {
	return btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

var textEncoder = new TextEncoder();

// email = john.doe@gmail.com
BACME.accounts.sign = function (email) {
	var payload64 = BACME._jsto64(
		{ termsOfServiceAgreed: true
		, onlyReturnExisting: false
		, contact: [ 'mailto:' + email ]
		}
	);

	var protected64 = BACME._jsto64(
		{ nonce: nonce
		, url: accountUrl
		, alg: 'ES256'
		, jwk: {
				kty: accountJwk.kty
			, crv: accountJwk.crv
			, x: accountJwk.x
			, y: accountJwk.y
			}
		}
	);

	// Note: this function hashes before signing so send data, not the hash
	return window.crypto.subtle.sign(
		{ name: "ECDSA", hash: { name: "SHA-256" } }
	, accountKeypair.privateKey
	, textEncoder.encode(protected64 + '.' + payload64)
	).then(function (signature) {

		// convert buffer to urlsafe base64
		var sig64 = btoa(Array.prototype.map.call(new Uint8Array(signature), function (ch) {
			return String.fromCharCode(ch);
		}).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

		console.log('URL-safe Base64 Signature:');
		console.log(sig64);

		signedAccount = {
			protected: protected64
		, payload: payload64
		, signature: sig64
		};
		console.log('Signed Base64 Account:');
		console.log(JSON.stringify(signedAccount, null, 2));
	});
};

var account;
var accountId;

BACME.accounts.set = function () {
	nonce = null;
	return window.fetch(accountUrl, {
		mode: 'cors'
	, method: 'POST'
	, headers: { 'Content-Type': 'application/jose+json' }
	, body: JSON.stringify(signedAccount)
	}).then(function (resp) {
		BACME._logHeaders(resp);
		nonce = resp.headers.get('replay-nonce');
		accountId = resp.headers.get('location');
		console.log('Next nonce:', nonce);
		console.log('Location/kid:', accountId);

		if (!resp.headers.get('content-type')) {
		 console.log('Body: <none>');
		 return;
		}

		return resp.json().then(function (result) {
      BACME._logBody(result);
		});
	});
};

var orderUrl;
var signedOrder;

BACME.orders = {};

// identifiers = [ { type: 'dns', value: 'example.com' }, { type: 'dns', value: '*.example.com' } ]
BACME.orders.sign = function (identifiers) {
	var payload64 = jsto64({ identifiers: identifiers });

	var protected64 = jsto64(
		{ nonce: nonce, alg: 'ES256', url: orderUrl, kid: accountId }
	);

	return window.crypto.subtle.sign(
		{ name: "ECDSA", hash: { name: "SHA-256" } }
	, accountKeypair.privateKey
	, textEncoder.encode(protected64 + '.' + payload64)
	).then(function (signature) {

		// convert buffer to urlsafe base64
		var sig64 = btoa(Array.prototype.map.call(new Uint8Array(signature), function (ch) {
			return String.fromCharCode(ch);
		}).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

		console.log('URL-safe Base64 Signature:');
		console.log(sig64);

		signedOrder = {
			protected: protected64
		, payload: payload64
		, signature: sig64
		};
		console.log('Signed Base64 Order:');
		console.log(JSON.stringify(signedAccount, null, 2));

    return signedOrder;
	});
};

var order;
var currentOrderUrl;
var authorizationUrls;
var finalizeUrl;

BACME.orders.create = function () {
	nonce = null;
	return window.fetch(orderUrl, {
		mode: 'cors'
	, method: 'POST'
	, headers: { 'Content-Type': 'application/jose+json' }
	, body: JSON.stringify(signedOrder)
	}).then(function (resp) {
		console.log('Headers:');
		Array.from(resp.headers.entries()).forEach(function (h) { console.log(h[0] + ': ' + h[1]); });
		currentOrderUrl = resp.headers.get('location');
		nonce = resp.headers.get('replay-nonce');
		console.log('Next nonce:', nonce);

		return resp.json().then(function (result) {
			authorizationUrls = result.authorizations;
			finalizeUrl = result.finalize;
			console.log('Body:');
			console.log(JSON.stringify(result, null, 2));

      return result;
		});
	});
};

BACME.challenges = {};
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

BACME.thumbprint = function () {
	// https://stackoverflow.com/questions/42588786/how-to-fingerprint-a-jwk

	var accountPublicStr = '{' + ['crv', 'kty', 'x', 'y'].map(function (key) {
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
  var payload64 = jsto64(
		{}
	);

	var protected64 = jsto64(
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
			console.log('Headers:');
			Array.from(resp.headers.entries()).forEach(function (h) { console.log(h[0] + ': ' + h[1]); });
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
	var payload64 = jsto64(
		{ csr: csr }
	);

	var protected64 = jsto64(
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
