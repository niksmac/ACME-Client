(function() {
	"use strict";

	/*global URLSearchParams,Headers*/
	var PromiseA = window.Promise;
	var VERSION = "2";
	// ACME recommends ECDSA P-256, but RSA 2048 is still required by some old servers (like what replicated.io uses )
	// ECDSA P-384, P-521, and RSA 3072, 4096 are NOT recommend standards (and not properly supported)
	var BROWSER_SUPPORTS_RSA = false;
	var ECDSA_OPTS = { kty: "EC", namedCurve: "P-256" };
	var RSA_OPTS = { kty: "RSA", modulusLength: 2048 };
	var Promise = window.Promise;
	var Keypairs = window.Keypairs;
	var ACME = window.ACME;
	var CSR = window.CSR;
	var $qs = function(s) {
		return window.document.querySelector(s);
	};
	var $qsa = function(s) {
		return window.document.querySelectorAll(s);
	};
	var acme;
	var info = {};
	var steps = {};
	var i = 1;
	var apiUrl = "https://acme-{{env}}.api.letsencrypt.org/directory";

	// fix previous browsers
	var isCurrent = localStorage.getItem("version") === VERSION;
	if (!isCurrent) {
		localStorage.clear();
		localStorage.setItem("version", VERSION);
	}
	localStorage.setItem("version", VERSION);

	function updateApiType() {
		/*jshint validthis: true */
		var input =
			this ||
			Array.prototype.filter.call($qsa(".js-acme-api-type"), function($el) {
				return $el.checked;
			})[0];
		//#console.log('ACME api type radio:', input.value);
		$qs(".js-acme-directory-url").value = apiUrl.replace(
			/{{env}}/g,
			input.value
		);
	}

	function hideForms() {
		$qsa(".js-acme-form").forEach(function(el) {
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

	function newAlert(str) {
		return new Promise(function() {
			setTimeout(function() {
				window.alert(str);
				if (window.confirm("Start over?")) {
					document.location.href = document.location.href.replace(
						/\/app.*/,
						"/"
					);
				}
			}, 10);
		});
	}

	function submitForm(ev) {
		var j = i;
		i += 1;

		return PromiseA.resolve()
			.then(function() {
				return steps[j].submit(ev);
			})
			.catch(function(err) {
				var ourfault = true;
				console.error(err);
				if (/failed to fetch/i.test(err.message)) {
					return newAlert("Network connection failure.");
				}

				if ("E_ACME_CHALLENGE" === err.code) {
					if ("dns-01" === err.type) {
						ourfault = false;
						return newAlert(
							"It looks like the DNS record you set for " +
								err.altname +
								" was incorrect or did not propagate. " +
								"The error message was '" +
								err.message +
								"'"
						);
					} else if ("http-01" === err.type) {
						ourfault = false;
						return newAlert(
							"It looks like the file you uploaded for " +
								err.altname +
								" was incorrect or could not be downloaded. " +
								"The error message was '" +
								err.message +
								"'"
						);
					}
				}

				if (ourfault) {
					err.auth = undefined;
					window.alert(
						"Something went wrong. It's probably our fault, not yours." +
							" Please email aj@rootprojects.org to let him know. The error message is: \n" +
							JSON.stringify(err, null, 2)
					);
					return new Promise(function() {});
				}
			});
	}

	function testKeypairSupport() {
		return Keypairs.generate(RSA_OPTS)
			.then(function() {
				console.info("[crypto] RSA is supported");
				BROWSER_SUPPORTS_RSA = true;
			})
			.catch(function() {
				console.warn("[crypto] RSA is NOT supported");
				return Keypairs.generate(ECDSA_OPTS)
					.then(function() {
						console.info("[crypto] ECDSA is supported");
					})
					.catch(function(e) {
						console.warn("[crypto] EC is NOT supported");
						throw e;
					});
			});
	}

	function getServerKeypair() {
		var sortedAltnames = info.identifiers
			.map(function(ident) {
				return ident.value;
			})
			.sort()
			.join(",");
		var serverJwk = JSON.parse(
			localStorage.getItem("server:" + sortedAltnames) || "null"
		);
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

		return Keypairs.generate(RSA_OPTS)
			.catch(function(err) {
				console.error(
					"[Error] Keypairs.generate(" + JSON.stringify(RSA_OPTS) + "):"
				);
				throw err;
			})
			.then(function(pair) {
				localStorage.setItem(
					"server:" + sortedAltnames,
					JSON.stringify(pair.private)
				);
				return pair.private;
			});
	}

	function getAccountKeypair(email) {
		var json = localStorage.getItem("account:" + email);
		if (json) {
			return Promise.resolve(JSON.parse(json));
		}

		return Keypairs.generate(ECDSA_OPTS)
			.catch(function(err) {
				console.warn(
					"[Error] Keypairs.generate(" + JSON.stringify(ECDSA_OPTS) + "):\n",
					err
				);
				return Keypairs.generate(RSA_OPTS).catch(function(err) {
					console.error(
						"[Error] Keypairs.generate(" + JSON.stringify(RSA_OPTS) + "):"
					);
					throw err;
				});
			})
			.then(function(pair) {
				localStorage.setItem("account:" + email, JSON.stringify(pair.private));
				return pair.private;
			});
	}

	function updateChallengeType() {
		/*jshint validthis: true*/
		var input =
			this ||
			Array.prototype.filter.call($qsa(".js-acme-challenge-type"), function(
				$el
			) {
				return $el.checked;
			})[0];
		$qs(".js-acme-verification-wildcard").hidden = true;
		$qs(".js-acme-verification-http-01").hidden = true;
		$qs(".js-acme-verification-dns-01").hidden = true;
		if (info.challenges.wildcard) {
			$qs(".js-acme-verification-wildcard").hidden = false;
		}
		if (info.challenges[input.value]) {
			$qs(".js-acme-verification-" + input.value).hidden = false;
		}
	}

	function saveContact(email, domains) {
		// to be used for good, not evil
		return window
			.fetch(
				"https://api.rootprojects.org/api/rootprojects.org/public/community",
				{
					method: "POST",
					cors: true,
					headers: new Headers({ "Content-Type": "application/json" }),
					body: JSON.stringify({
						address: email,
						project: "greenlock-domains@rootprojects.org",
						timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
						domain: domains.join(",")
					})
				}
			)
			.catch(function(err) {
				console.error(err);
			});
	}

	steps[1] = function() {
		console.info("\n1. Show domains form");
		updateProgress(0);
		hideForms();
		$qs(".js-acme-form-domains").hidden = false;
	};
	steps[1].submit = function() {
		console.info(
			"[submit] 1. Process domains, create ACME client",
			info.domains
		);
		info.domains = $qs(".js-acme-domains")
			.value.replace(/https?:\/\//g, " ")
			.replace(/[,+]/g, " ")
			.trim()
			.split(/\s+/g);
		console.info("[domains]", info.domains.join(" "));

		info.identifiers = info.domains.map(function(hostname) {
			return { type: "dns", value: hostname.toLowerCase().trim() };
		});
		info.identifiers.sort(function(a, b) {
			if (a === b) {
				return 0;
			}
			if (a < b) {
				return 1;
			}
			if (a > b) {
				return -1;
			}
		});

		var acmeDirectoryUrl = $qs(".js-acme-directory-url").value;
		acme = ACME.create({ Keypairs: Keypairs, CSR: CSR });
		return acme.init(acmeDirectoryUrl).then(function(directory) {
			$qs(".js-acme-tos-url").href = directory.meta.termsOfService;
			return steps[i]();
		});
	};

	steps[2] = function() {
		console.info("\n2. Show account (email, ToS) form");

		updateProgress(0);
		hideForms();
		$qs(".js-acme-form-account").hidden = false;
	};
	steps[2].submit = function() {
		console.info("[submit] 2. Create ACME account (get Key ID)");

		var email = $qs(".js-acme-account-email")
			.value.toLowerCase()
			.trim();
		info.email = email;
		info.contact = ["mailto:" + email];
		info.agree = $qs(".js-acme-account-tos").checked;
		//info.greenlockAgree = $qs('.js-gl-tos').checked;

		// TODO ping with version and account creation
		setTimeout(saveContact, 100, email, info.domains);

		$qs(".js-account-next").disabled = true;

		return info.cryptoCheck
			.then(function() {
				return getAccountKeypair(email).then(function(jwk) {
					// TODO save account id rather than always retrieving it?
					console.info("[accounts] upsert for", email);
					return acme.accounts
						.create({
							email: email,
							agreeToTerms: info.agree && true,
							accountKeypair: { privateKeyJwk: jwk }
						})
						.then(function(account) {
							console.info("[accounts] result:", account);
							info.account = account;
							info.privateJwk = jwk;
							info.email = email;
						})
						.catch(function(err) {
							console.error("[accounts] failed to upsert account:");
							console.error(err);
							return newAlert(err.message || JSON.stringify(err, null, 2));
						});
				});
			})
			.then(function() {
				var jwk = info.privateJwk;
				var account = info.account;

				console.info("[orders] requesting");
				return acme.orders
					.request({
						account: account,
						accountKeypair: { privateKeyJwk: jwk },
						domains: info.domains
					})
					.then(function(order) {
						info.order = order;
						console.info("[orders] created ", order);

						var claims = order.claims;

						var obj = { "dns-01": [], "http-01": [], wildcard: [] };
						info.challenges = obj;

						var $httpList = $qs(".js-acme-http");
						var $dnsList = $qs(".js-acme-dns");
						var $wildList = $qs(".js-acme-wildcard");
						var httpTpl = $httpList.innerHTML;
						var dnsTpl = $dnsList.innerHTML;
						var wildTpl = $wildList.innerHTML;
						$httpList.innerHTML = "";
						$dnsList.innerHTML = "";
						$wildList.innerHTML = "";

						claims.forEach(function(claim) {
							//#console.log("claims[i]", claim);
							var hostname = claim.identifier.value;
							claim.challenges.forEach(function(c) {
								var auth = c;
								var data = {
									type: c.type,
									hostname: hostname,
									url: c.url,
									token: c.token,
									httpPath: auth.challengeUrl,
									httpAuth: auth.keyAuthorization,
									dnsType: "TXT",
									dnsHost: auth.dnsHost,
									dnsAnswer: auth.keyAuthorizationDigest
								};
								//#console.log("claims[i].challenge", data);

								var $tpl = document.createElement("div");
								if (claim.wildcard) {
									obj.wildcard.push(data);
									$tpl.innerHTML = wildTpl;
									$tpl.querySelector(".js-acme-ver-txt-host").innerHTML =
										data.dnsHost;
									$tpl.querySelector(".js-acme-ver-txt-value").innerHTML =
										data.dnsAnswer;
									$wildList.appendChild($tpl);
								} else if (obj[data.type]) {
									obj[data.type].push(data);

									if ("dns-01" === data.type) {
										$tpl.innerHTML = dnsTpl;
										$tpl.querySelector(".js-acme-ver-txt-host").innerHTML =
											data.dnsHost;
										$tpl.querySelector(".js-acme-ver-txt-value").innerHTML =
											data.dnsAnswer;
										$dnsList.appendChild($tpl);
									} else if ("http-01" === data.type) {
										$tpl.innerHTML = httpTpl;
										$tpl.querySelector(
											".js-acme-ver-file-location"
										).innerHTML = data.httpPath.split("/").slice(-1);
										$tpl.querySelector(".js-acme-ver-content").innerHTML =
											data.httpAuth;
										$tpl.querySelector(".js-acme-ver-uri").innerHTML =
											data.httpPath;
										$tpl.querySelector(".js-download-verify-link").href =
											"data:text/octet-stream;base64," +
											window.btoa(data.httpAuth);
										$tpl.querySelector(
											".js-download-verify-link"
										).download = data.httpPath.split("/").slice(-1);
										$httpList.appendChild($tpl);
									}
								}
							});
						});

						// hide wildcard if no wildcard
						// hide http-01 and dns-01 if only wildcard
						if (!obj.wildcard.length) {
							$qs(".js-acme-wildcard-challenges").hidden = true;
						}
						if (!obj["http-01"].length) {
							$qs(".js-acme-challenges").hidden = true;
						}

						console.info("[housekeeping] challenges", info.challenges);

						updateChallengeType();
						return steps[i]();
					})
					.catch(function(err) {
						if (err.detail || err.urn) {
							console.error("(Probably) User Error:");
							console.error(err);
							return newAlert(
								"There was an error, probably with your email or domain:\n" +
									err.message
							);
						}
						throw err;
					});
			})
			.catch(function(err) {
				console.error("Step '' Error:");
				console.error(err, err.stack);
				return newAlert(
					"An error happened (but it's not your fault)." +
						" Email aj@rootprojects.org to let him know that 'order and get challenges' failed."
				);
			});
	};

	steps[3] = function() {
		console.info("\n3. Present challenge options");
		updateProgress(1);
		hideForms();
		$qs(".js-acme-form-challenges").hidden = false;
	};
	steps[3].submit = function() {
		console.info("[submit] 3. Fulfill challenges, fetch certificate");

		var challengePriority = ["dns-01"];
		if ("http-01" === $qs(".js-acme-challenge-type:checked").value) {
			challengePriority.unshift("http-01");
		}
		console.info("[challenge] selected ", challengePriority[0]);

		// for now just show the next page immediately (its a spinner)
		steps[i]();

		return getAccountKeypair(info.email).then(function(jwk) {
			// TODO put a test challenge in the list
			// info.order.claims.push(...)
			// TODO warn about wait-time if DNS
			return getServerKeypair().then(function(serverJwk) {
				return acme.orders
					.complete({
						account: info.account,
						accountKeypair: { privateKeyJwk: jwk },
						order: info.order,
						domains: info.domains,
						domainKeypair: { privateKeyJwk: serverJwk },
						challengePriority: challengePriority,
						challenges: false,
						onChallengeStatus: function(details) {
							$qs(".js-challenge-responses").hidden = false;
							$qs(".js-challenge-response-type").innerText = details.type;
							$qs(".js-challenge-response-status").innerText = details.status;
							$qs(".js-challenge-response-altname").innerText = details.altname;
						}
					})
					.then(function(certs) {
						return Keypairs.export({ jwk: serverJwk }).then(function(keyPem) {
							console.info("WINNING!");
							console.info(certs);
							var fullChainText = [
								certs.cert.trim() + "\n",
								certs.chain + "\n"
							].join("\n");

							$qs("#js-fullchain").innerHTML = fullChainText;
							$qs("#js-download-fullchain-link").href =
								"data:text/octet-stream;base64," + window.btoa(fullChainText);

							$qs("#js-privkey").innerHTML = keyPem;
							$qs("#js-download-privkey-link").href =
								"data:text/octet-stream;base64," + window.btoa(keyPem);
							return submitForm();
						});
					});
			});
		});
	};

	// spinner
	steps[4] = function() {
		console.info("\n4. Show loading spinner");
		updateProgress(1);
		hideForms();
		$qs(".js-acme-form-poll").hidden = false;
	};
	steps[4].submit = function() {
		console.info("[submit] 4. Order complete");

		return steps[i]();
	};

	steps[5] = function() {
		console.info("\n5. Present certificates (yay!)");
		updateProgress(2);
		hideForms();
		$qs(".js-acme-form-download").hidden = false;
	};

	function init() {
		$qsa(".js-acme-api-type").forEach(function($el) {
			$el.addEventListener("change", updateApiType);
		});
		updateApiType();

		$qsa(".js-acme-form").forEach(function($el) {
			$el.addEventListener("submit", function(ev) {
				ev.preventDefault();
				return submitForm(ev);
			});
		});

		$qsa(".js-acme-challenge-type").forEach(function($el) {
			$el.addEventListener("change", updateChallengeType);
		});

		var params = new URLSearchParams(window.location.search);
		var apiType = params.get("acme-api-type") || "staging-v02";
		if (params.has("acme-domains")) {
			$qs(".js-acme-domains").value = params.get("acme-domains");

			$qsa(".js-acme-api-type").forEach(function(ele) {
				if (ele.value === apiType) {
					ele.checked = true;
				}
			});

			updateApiType();
			steps[2]();
			return submitForm();
		} else {
			steps[1]();
		}
	}

	init();
	$qs("body").hidden = false;

	// in the background
	info.cryptoCheck = testKeypairSupport()
		.then(function() {
			console.info("[crypto] self-check: passed");
		})
		.catch(function(err) {
			console.error("[crypto] could not use either RSA nor EC.");
			console.error(err);
			window.alert(
				"Generating secure certificates requires a browser with cryptography support." +
					"Please consider a recent version of Chrome, Firefox, or Safari."
			);
			throw err;
		});
})();
