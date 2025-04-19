clear && echo "----------------------------------"
rm -rf main.min.js && minify main.js > main.min.js
echo "Backend build make it."
echo "----------------------------------"
rm -rf rename_mp3_files && go build rename_mp3_files.go
echo "Go rename_mp3_files build make it."
echo "----------------------------------"
cd server_files && ./build.sh && cd ../
echo "Server files build make it."
echo "----------------------------------"
rm -rf website/apk/app-release.apk && cp ../app/app/release/app-release.apk website/apk
echo "APK copied to website."
echo "----------------------------------"
rar a build.rar -r main.min.js package.json .env rename_mp3_files server_files/static_files website/ proxy_server/proxy_server -xnode_modules/*
echo "----------------------------------"