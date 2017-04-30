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
  emitter.on('pickedQuiz', wrapRender(data => state.quiz = data));
  emitter.on('clearQuiz', wrapRender(data => state.quiz = null));
  emitter.on('proposeAnswer', wrapRender(data => {
               // console.log(data, state);
               if (data === state.quiz[0]) {
                 console.log('Success!');
               } else {
                 console.log('Fail :(');
               }
               state.quiz = pickQuiz();
             }));
});
function main(state, emit) {
  // console.log(state);
  var quizHtml;
  if (state.quiz) {
    quizHtml = administerQuiz(state.quiz, emit);
  }
  return html`<div>
  <button onclick=${hitClick}>Hit me ${state.name}</button>
  ${quizHtml}
  </div>`;

  function hitClick(e) { emit('pickedQuiz', pickQuiz()); }
}
app.route('/', main);
app.mount('#app');

///////////////// Quizzer!

var fs = require('fs');
var tono = JSON.parse(fs.readFileSync('data/tono.json', 'utf8'));

// Administer a quiz
function administerQuiz(picked, emit) {
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
  // for now, let this function pick confusers. pickQuiz could also suggest
  // confusers, or alternatively a more complicated UI could be here (text
  // input, reorder words, etc.)
  var confusers;
  var btn = (i) => html`<button choo-num=${i - 1} onclick=${accept}>x</button>`;
  if (field === 'kanjis') {
    let f = Array.from(Array(4), () => tono[randomFactWithKanji(num)]);
    f.push(fact);
    shuffle(f);
    confusers = f.map(f => html`<li>${btn(f.num)}${f.kanjis.join('/')}</li>`);
  } else {
    let f = Array.from(Array(4), () => tono[randinot(tono.length, num)]);
    f.push(fact);
    shuffle(f);
    if (field === 'readings') {
      confusers =
          f.map(f => html`<li>${btn(f.num)}${f.readings.join('/')}</li>`);
    } else {
      confusers = f.map(f => html`<li>${btn(f.num)}${f.meaning}</li>`);
    }
  }

  return html`<div>
      You have to guess #${num + 1}’s ${field}! Soooo, ${clues}! Is it:
      <ol>
      ${confusers}
      </ol>
  </div>`;

  function accept(e) {
    var proposal = e.target.getAttribute('choo-num');
    emit('proposeAnswer', +proposal);
  }
}

function randomFactWithKanji(not) {
  if (typeof not === 'undefined') {
    not = -1;
  }
  while (true) {
    var num = randi(tono.length);
    if (tono[num].kanjis.length > 0 && num !== not) {
      return num
    };
  }
}

// Pick a fact (and any specifics, like sub-fact) to quiz
function pickQuiz() {
  var topics;
  var num = randi(tono.length);
  if (tono[num].kanjis.length === 0) {
    topics = [ 'readings', 'meaning' ]
  } else {
    topics = [ 'kanjis', 'readings', 'meaning' ];
  }
  const quiz = [ num, topics[randi(topics.length)] ];
  return quiz;
}

// Fisher-Yates draw-without-replacement shuffle
function shuffle(array) {
  for (var i = array.length - 1; i > 0; i -= 1) {
    var j = randi(i + 1);
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

function randinot(n, not) {
  if (typeof not === 'undefined') {
    not = -1;
  }
  while (true) {
    var num = randi(n);
    if (num !== not) {
      return num;
    }
  }
}

function randi(n) { return Math.floor(Math.random() * n); }