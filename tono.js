"use strict";
var fs = require('fs');
var tono = JSON.parse(fs.readFileSync('data/tono.json', 'utf8'));
module.exports = tono;