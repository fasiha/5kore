all: client/client.js client/tono.js test.html client/client.min.js

client/client.js: client.js
	node_modules/.bin/browserify -t brfs client.js -s client -o client/client.js

client/client.min.js: client/client.js
	./node_modules/.bin/google-closure-compiler-js client/client.js > client/client.min.js &

test.html: index.html
	sed 's:client/client.min.js:client/client.js:' index.html > test.html

client/tono.js: tono.js data/tono.json
	node_modules/.bin/browserify -t brfs tono.js -s tono -o client/tono.js

watch:
	fswatch -0 -o -l .1 client.js | xargs -0 -n 1 -I {} make