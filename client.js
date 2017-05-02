"use strict";
var choo = require('choo');
var html = require('choo/html');
var app = choo();

var fs = require('fs');
var tono = JSON.parse(fs.readFileSync('data/tono.json', 'utf8'));

// Set up state and handlers (in re-frame terminology)
app.use((state, emitter) => {
  state.quiz = null;      // Maybe [number under quiz 0 <= num <= 4999, field]
  state.answered = null;  // Maybe number of answer
  state.page = 'showall'; // Quiz | Answered | ShowAll | Learn
  state.learning = null;  // Maybe (number to learn, 0 <= num <= 4999)

  function wrapRender(f) {
    return data => {
      f(data);
      emitter.emit('render')
    };
  }
  emitter.on('pickedQuiz', wrapRender(data => {
               state.quiz = data;
               state.answered = null;
               state.page = 'quiz';
             }));
  emitter.on('clearQuiz', wrapRender(data => state.quiz = null));
  emitter.on('proposeAnswer', wrapRender(data => {
               state.answered = data;
               state.page = 'answered';
               // state.quiz = pickQuiz();
             }));
  emitter.on('seeAll', wrapRender(() => { state.page = 'showall'; }))
  emitter.on('learnFact', wrapRender((data) => {
               state.page = 'learn';
               state.learning = data;
             }));
  emitter.on('doneLearning', wrapRender(() => { state.page = 'showall'; }))
});

// Set up views
function main(state, emit) {
  console.log(state);
  var raw;
  if (state.page === 'quiz') {
    raw = administerQuiz(state.quiz, emit);
  } else if (state.page === 'answered') {
    raw = answeredQuiz(state.quiz, state.answered);
  } else if (state.page === 'showall') {
    raw = allFacts(emit);
  } else if (state.page === 'learn') {
    raw = learning(state.learning, emit);
  }
  return html`<div>
  <button onclick=${showClick}>Show all</button>
  <button onclick=${hitClick}>Quiz me</button>
  ${raw}
  </div>`;

  function hitClick(e) { emit('pickedQuiz', pickQuiz()); }
  function showClick(e) { emit('seeAll'); }
}
app.route('/', main);
app.mount('#app');

///////////////// Quizzer! And other screens!

var registerToFull = {
  BK : "books",
  WB : "web",
  OF : "official documents",
  NM : "newspapers and magazines",
  SP : "spoken"
};

function learning(num, emit) {
  var fact = tono[num];
  var register = fact.register ? html`<li>
  Top word in the <em>${registerToFull[fact.register]}</em> register.
  </li>`
                               : '';
  return html`<div>
  Remember this! ${quickRenderFact(fact)} means: ${fact.meaning}.
  <ul>
    <li>Roumaji: ${fact.roumaji}</li>
    <li>Frequency: ${fact.freq} per million</li>
    <li>#${fact.num}</li>
    <li>Dispersion: ${fact.disp}</li>
    ${register}
  </ul>
  <button onclick=${learnedClick}>I HAVE LEARNED THIS!</button>
  </div>`;

  function learnedClick() { emit('doneLearning'); }
}

function quickRenderFact(fact) {
  var readings = fact.readings.join('/');
  if (fact.kanjis.length > 0) {
    var kanjis = fact.kanjis.join('/');
    return html`<ruby>${kanjis}<rt>${readings}</rt></ruby>`;
  }
  return html`<span>${readings}</span>`;
}

function allFacts(emit) {
  var renderedFacts = tono.map(o => html`<li>
    <button choo-num=${o.num - 1} onclick=${click}>learn</button>
    ${quickRenderFact(o)}
    </li>`);
  return html`<ul>
  ${renderedFacts}
  </ul>`;

  function click(e) { emit('learnFact', +e.target.getAttribute('choo-num')) }
}

function answeredQuiz(picked, answer) {
  var result = answer === picked[0];
  var resultStr = result ? "🙌 congrats!" : "💩";
  return html`<div>${resultStr}
  ${JSON.stringify(tono[picked[0]])}
  </div>`;
}

// Administer a quiz
function administerQuiz(picked, emit) {
  var [num, field] = picked;
  var fact = tono[num];
  var hasKanji = fact.kanjis.length > 0;

  // Prompts to elicit the field under quiz from student
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
    confusers =
        f.map(f => html`<li>${btn(f.num)}${f.num}${f.kanjis.join('/')}</li>`);
  } else {
    let f = Array.from(Array(4), () => tono[randinot(tono.length, num)]);
    f.push(fact);
    shuffle(f);
    if (field === 'readings') {
      confusers = f.map(
          f => html`<li>${btn(f.num)}${f.num}${f.readings.join('/')}</li>`);
    } else {
      confusers = f.map(f => html`<li>${btn(f.num)}${f.num}${f.meaning}</li>`);
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

// Utilities

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