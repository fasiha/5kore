"use strict";
var choo = require('choo');
var html = require('choo/html');
var app = choo();
var main = function() { return html`<div>choo choo</div>` };
app.route('/', main);
app.mount('#app');
