mkdir -p js/pkijs.org/v1.3.33/
pushd js/pkijs.org/v1.3.33/
  wget -c https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/common.js
  wget -c https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/x509_schema.js
  wget -c https://raw.githubusercontent.com/PeculiarVentures/PKI.js/41b63af760cacb565dd850fb3466ada4ca163eff/org/pkijs/x509_simpl.js
  wget -c https://raw.githubusercontent.com/PeculiarVentures/ASN1.js/f7181c21c61e53a940ea24373ab489ad86d51bc1/org/pkijs/asn1.js
