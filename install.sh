#!/bin/bash

mkdir -p app/js/
pushd app/js/
  wget -c https://rootprojects.org/acme/bluecrypt-acme.js
  wget -c https://rootprojects.org/acme/bluecrypt-acme.min.js
popd
