
mkdir -p app\js\
bitsadmin.exe /transfer "JobName" https://rootprojects.org/acme/bluecrypt-acme.js "%cd%\app\js\bluecrypt-acme.js"
bitsadmin.exe /transfer "JobName" https://rootprojects.org/acme/bluecrypt-acme.min.js "%cd%\app\js\bluecrypt-acme.min.js"
