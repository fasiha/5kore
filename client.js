"use strict";
var choo = require('choo');
var html = require('choo/html');
var app = choo();

/////////////////// Lovefield

var schemaBuilder = lf.schema.create('5kore', 1);
schemaBuilder.createTable('Fact')
    .addColumn('num', lf.Type.NUMBER)
    .addColumn('lastQuizTime', lf.Type.DATE_TIME)
    .addColumn('recallObject', lf.Type.OBJECT)
    .addColumn('skipped', lf.Type.BOOLEAN)
    .addColumn('started', lf.Type.BOOLEAN)
    .addPrimaryKey([ 'num' ])
    .addNullable([ 'lastQuizTime', 'recallObject' ]);
// TODO Add an index to find the next thing to study

schemaBuilder.createTable('Quiz')
    .addColumn('num', lf.Type.NUMBER)
    .addColumn('date', lf.Type.DATE_TIME)
    .addColumn('result', lf.Type.BOOLEAN)
    .addPrimaryKey([ 'date' ])
    .addForeignKey('fk_NumQuiz', {local : 'num', ref : 'Fact.num'});

var koredb;
var factTable;
var quizTable;

function factOk(fact) {
  var lookFors = 'n.,v.,adj.,adv.,pron.,adn.'.split(',');
  for (let target of lookFors) {
    if (fact.meaning.indexOf(target) >= 0) {
      return true;
    }
  }
  return false;
}

function initializing(emit) {
  schemaBuilder.connect()
      .then(function(db) {
        koredb = db;
        factTable = db.getSchema().table('Fact');
        quizTable = db.getSchema().table('Quiz');
        return koredb.select(lf.fn.count(factTable.num)).from(factTable).exec();
      })
      .then(o => {
        var numrows = o[0]['COUNT(num)'];
        if (numrows === 0) {
          console.log('No facts found, populating');
          let rows = tono.map(fact => {
            return factTable.createRow({
              num : fact.num,
              skipped : !factOk(fact),
              started : false,
              lastQuizTime : null
            });
          });
          return koredb.insert().into(factTable).values(rows).exec();
        }
        return true;
      })
      .then(() => {
        koredb.select()
            .from(factTable)
            .where(factTable.skipped.eq(true))
            .exec()
            .then(rows =>
                      emit('skippedList', new Set(rows.map(r => r.num - 1))));
        koredb.select()
            .from(factTable)
            .where(factTable.started.eq(true))
            .exec()
            .then(rows =>
                      emit('startedList', new Set(rows.map(r => r.num - 1))));
        return true;
      })
      .then(() => { emit('seeAll'); });
  return html`<div>Initializing the fun…</div>`;
}

/////////////////// Choo!

// Set up state and handlers (in re-frame terminology)
app.use((state, emitter) => {
  state.quiz = null;     // Maybe [number under quiz 0 <= num <= 4999, field]
  state.answered = null; // Maybe number of answer
  state.page = 'init';   // Quiz | Answered | ShowAll | Learn | Init
  state.learning = null; // Maybe (number to learn, 0 <= num <= 4999)
  state.skippedNums = new Set([]); // Array of quiz numbers in (0, 4999)
  state.startedNums = new Set([]); // Set of quiz numbers in (0, 4999)

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
             }));
  emitter.on('seeAll', wrapRender(() => { state.page = 'showall'; }))
  emitter.on('learnFact', wrapRender((data) => {
               state.page = 'learn';
               state.learning = data;
             }));
  emitter.on('doneLearning', wrapRender(() => { state.page = 'showall'; }))
  emitter.on('skippedList', wrapRender(data => { state.skippedNums = data; }))
  emitter.on('startedList', wrapRender(data => { state.startedNums = data; }))

  emitter.on('previousLearnable', wrapRender(() => {
               state.learning = prevNextLearnable(state, -1);
             }));
  emitter.on('nextLearnable', wrapRender(() => {
               state.learning = prevNextLearnable(state, +1);
             }));

  function prevNextLearnable(state, direction) {
    // direction: -1 or +1
    var curr = state.learning || 0;
    var init = curr + direction;
    for (let i = init; i >= 0 && i < tono.length; i += direction) {
      if (!state.skippedNums.has(i) && !state.startedNums.has(i)) {
        return i;
      }
    }
    return curr;
  }

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
    raw = allFacts(state, emit);
  } else if (state.page === 'learn') {
    raw = learning(state.learning, emit);
  } else if (state.page === 'init') {
    raw = initializing(emit);
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
  <p>
  Skip learning this fact?
  Jump to <button onclick=${prevClick}>Previous</button> or
  <button onclick=${nextClick}>Next</button> unlearned + unskipped fact.
  </p>
  <p>
  Remember this! <big>${quickRenderFact(fact)}</big> means: <em>${
                                                                  fact.meaning
                                                                }</em>.
  <ul>
    <li>Roumaji: ${fact.roumaji}</li>
    <li>Frequency: ${fact.freq} per million</li>
    <li>#${fact.num}</li>
    <li>Dispersion: ${fact.disp}</li>
    ${register}
  </ul>
  </p>
  <button onclick=${learnedClick}>I HAVE LEARNED THIS!</button>
  </div>`;

  function learnedClick() { emit('doneLearning'); }
  function prevClick() { emit('previousLearnable'); }
  function nextClick() { emit('nextLearnable'); }
}

function quickRenderFact(fact) {
  var readings = fact.readings.join('/');
  if (fact.kanjis.length > 0) {
    var kanjis = fact.kanjis.join('/');
    return html`<ruby>${kanjis}<rt>${readings}</rt></ruby>`;
  }
  return html`<span>${readings}</span>`;
}

function allFacts(state, emit) {
  var skipped = o => state.skippedNums.has(o.num - 1) ? 'skipped' : 'learnable';
  var started = o => state.startedNums.has(o.num - 1) ? 'started' : 'unstarted';
  var renderedFacts =
      tono.map(o => html`<li class="${skipped(o)} ${started(o)}">
      
      <button choo-num=${o.num - 1} onclick=${click}>Study</button>
      
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

module.exports = {
  tono,
  koredb,
  factTable,
  quizTable,
  schemaBuilder
};