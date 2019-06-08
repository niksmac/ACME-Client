
mkdir -p app\js\
bitsadmin.exe /transfer "JobName" https://rootprojects.org/acme/bluecrypt-acme.js "%cd%\app\js\bluecrypt-acme.js"
bitsadmin.exe /transfer "JobName" https://rootprojects.org/acme/bluecrypt-acme.min.js "%cd%\app\js\bluecrypt-acme.min.js"

mkdir -p app\js\pkijs.org\v1.3.33\
bitsadmin.exe /transfer "JobName" https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/common.js "%cd%\app\js\pkijs.org\v1.3.33\common.js"
bitsadmin.exe /transfer "JobName" https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/x509_schema.js "%cd%\app\js\pkijs.org\v1.3.33\x509_schema.js"
bitsadmin.exe /transfer "JobName" https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/x509_simpl.js "%cd%\app\js\pkijs.org\v1.3.33\x509_simpl.js"
bitsadmin.exe /transfer "JobName" https://raw.githubusercontent.com/PeculiarVentures/ASN1.js/f7181c21c61e53a940ea24373ab489ad86d51bc1/org/pkijs/asn1.js "%cd%\app\js\pkijs.org\v1.3.33\asn1.js"

mkdir -p app\js\browser-csr\v1.0.0-alpha\
curl -o app\js\browser-csr\v1.0.0-alpha\csr.js https://git.coolaj86.com/coolaj86/browser-csr.js/raw/commit/01cdc0e91b5bf03f12e1b25b4129e3cde927987c/csr.js
