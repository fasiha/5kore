"use strict";
var choo = require('choo');
var html = require('choo/html');
var app = choo();
app.use((state, emitter) => {
  state.name = "Sally";
  state.quiz = null;

  function wrapRender(f) {
    return data => {
      f(data);
      emitter.emit('render')
    };
  }
  emitter.on('nameChange', wrapRender(data => state.name = data));
  emitter.on('pickQuiz', wrapRender(data => state.quiz = data));
  emitter.on('clearQuiz', wrapRender(data => state.quiz = null));
});
function main(state, emit) {
  // console.log(state);
  var quizHtml;
  if (state.quiz) {
    quizHtml = administerQuiz(state.quiz, x => console.log('result,', x));
  }
  return html`<div>
  <button onclick=${hitClick}>Hit me ${state.name}</button>
  ${quizHtml}
  </div>`;

  function hitClick(e) { emit('pickQuiz', pickQuiz()); }
}
app.route('/', main);
app.mount('#app');

///////////////// Quizzer!

var fs = require('fs');
var tono = JSON.parse(fs.readFileSync('data/tono.json', 'utf8'));

// Administer a quiz
function administerQuiz(picked, resultCallback) {
  var [num, field] = picked;
  var fact = tono[num];
  var hasKanji = fact.kanjis.length > 0;
  var clues;
  if (field === 'kanjis') {
    clues = `${fact.readings.join('/')} (${fact.meaning})`;
  } else if (field === 'readings') {
    clues = `${hasKanji ? fact.kanjis.join('/') : ''} (${fact.meaning})`;
  } else {
    clues = (hasKanji ? fact.kanjis.join('/') + '; ' : '') +
            fact.readings.join('/');
  }
  return html`<div>
      You have to guess #${num + 1}’s ${field}! Soooo, ${clues}!
  </div>`;
}

// Pick a fact (and any specifics, like sub-fact) to quiz
function pickQuiz() {
  var topics;
  var num = randi(5000);
  if (tono[num].kanjis.length === 0) {
    topics = [ 'readings', 'meaning' ]
  } else {
    topics = [ 'kanjis', 'readings', 'meaning' ];
  }
  const quiz = [ num, topics[randi(topics.length)] ];
  return quiz;
}

function randi(n) { return Math.floor(Math.random() * n); }