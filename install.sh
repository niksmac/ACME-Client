#!/bin/bash

mkdir -p app/js/pkijs.org/v1.3.33/
pushd app/js/pkijs.org/v1.3.33/
  wget -c https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/common.js
  wget -c https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/x509_schema.js
  wget -c https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/x509_simpl.js
  wget -c https://raw.githubusercontent.com/PeculiarVentures/ASN1.js/f7181c21c61e53a940ea24373ab489ad86d51bc1/org/pkijs/asn1.js
popd

mkdir -p app/js/browser-csr/v1.0.0-alpha/
pushd app/js/browser-csr/v1.0.0-alpha/
  wget -c https://git.coolaj86.com/coolaj86/browser-csr.js/raw/commit/01cdc0e91b5bf03f12e1b25b4129e3cde927987c/csr.js
popd
