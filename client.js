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
  console.log(state);
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
  return html`<div>I picked ${num} and ${field}!
  </div>`;
}

// Pick a fact (and any specifics, like sub-fact) to quiz
function pickQuiz() {
  const topics = [ 'kanjis', 'readings', 'meanings' ];
  const quiz = [ randi(5000), topics[randi(3)] ];
  console.log('picked', quiz);
  return quiz;
}

function randi(n) { return Math.floor(Math.random() * n); }