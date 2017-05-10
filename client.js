"use strict";
var choo = require('choo');
var html = require('choo/html');
var app = choo();

///////////////////// Ebisu stuff & utilities
var DEFAULT_RECALL_OBJECT = [ 4, 4, 1 ];

function factOk(fact) {
  var lookFors = 'n.,v.,adj.,adv.,pron.,adn.'.split(',');
  for (let target of lookFors) {
    if (fact.meaning.indexOf(target) >= 0) {
      return true;
    }
  }
  return false;
}

function hoursElapsed(date) {
  const msPerHour = 3600e3;
  return ((new Date()) - date) / msPerHour;
}

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
    .addColumn('proposedAnswer', lf.Type.OBJECT)
    .addPrimaryKey([ 'date' ])
    .addForeignKey('fk_NumQuiz', {local : 'num', ref : 'Fact.num'});

var koredb;
var factTable;
var quizTable;

/////////////////// Choo!

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
        // Extract skipped/started from db into Choo state
        koredb.select()
            .from(factTable)
            .where(factTable.skipped.eq(true))
            .exec()
            .then(rows => emit('skippedList', new Set(rows.map(r => r.num))));
        koredb.select()
            .from(factTable)
            .where(factTable.started.eq(true))
            .exec()
            .then(rows => emit('startedList',
                               new Map(rows.map(r => [r.num, {
                                                  recallObject : r.recallObject,
                                                  lastQuizTime : r.lastQuizTime
                                                }]))));
        return true;
      })
      .then(() => { emit('seeAll'); });
  return html`<div>Initializing the fun…</div>`;
}

// Set up state and handlers (in re-frame terminology)
app.use((state, emitter) => {
  state.quiz = null;     // Maybe [number under quiz 1 <= num <= 5000, field]
  state.answered = null; // Maybe number of answer
  state.page = 'init';   // Quiz | Answered | ShowAll | Learn | Init
  state.learning = null; // Maybe (number to learn, 1 <= num <= 5000)
  state.skippedNums = new Set([]); // Set of quiz numbers in [1, 5000]
  state.startedNums = new Map([]); // Set of quiz numbers in 1, 5000

  function wrapRender(f) {
    return data => {
      f(data);
      emitter.emit('render')
    };
  }
  emitter.on('pickedQuiz', wrapRender(data => {
               if (data.found) {
                 state.quiz = [ data.num, data.topic ];
                 state.answered = null;
                 state.page = 'quiz';
               } else {
                 console.log('No quizzes possible! Learn someting first!');
               }
             }));
  emitter.on('clearQuiz', wrapRender(data => state.quiz = null));
  emitter.on('proposeAnswer', wrapRender(data => {
               var num = state.quiz[0];
               var date = new Date();
               var result = num === data;
               var recallObject = ebisu.updateRecall(
                   state.startedNums.get(num).recallObject, result,
                   hoursElapsed(state.startedNums.get(num).lastQuizTime));

               dbReviewed(state.quiz[0], recallObject, date, result, data);

               state.startedNums.set(
                   num, {recallObject : recallObject, lastQuizTime : date})

               state.answered = data;
               state.page = 'answered';
             }));
  emitter.on('seeAll', wrapRender(() => { state.page = 'showall'; }))
  emitter.on('learnFact', wrapRender((data) => {
               state.page = 'learn';
               state.learning = data;
             }));

  emitter.on('doneLearning', wrapRender(() => {
               var d = new Date();
               dbReviewed(state.learning, DEFAULT_RECALL_OBJECT, d, true);
               state.startedNums.set(
                   state.learning,
                   {recallObject : DEFAULT_RECALL_OBJECT, lastQuizTime : d});
               emitter.emit('nextLearnable')
             }));

  emitter.on('quizOrLearn', wrapRender(() => {
               var {numMinRecallProb, minRecallProb, minFound} =
                   lowestRecallProb(state.startedNums);
               var decision =
                   (!minFound || minRecallProb < 0.5) ? 'learn' : 'quiz';

               if (decision === 'learn') {
                 state.page = 'learn';
                 emitter.emit('nextLearnable', 1);
               } else {
                 emitter.emit('pickedQuiz', {
                   found : true,
                   num : numMinRecallProb,
                   topic : pickSubQuiz(numMinRecallProb)
                 });
               }
             }));

  emitter.on('previousLearnable', wrapRender((num) => {
               state.page = 'learn';
               state.learning = prevNextLearnable(num, state.skippedNums,
                                                  state.startedNums, -1);
             }));
  emitter.on('nextLearnable', wrapRender((num) => {
               state.page = 'learn';
               state.learning = prevNextLearnable(num, state.skippedNums,
                                                  state.startedNums, +1);
             }));
  // TODO 2: don’t store `started` in `factTable` since that’s derivable from
  // `quizTable`.
  // TODO 3: `tono` should be passed around yeah?

  // Only called during Lovefield initialization
  emitter.on('skippedList', wrapRender(data => { state.skippedNums = data; }))
  emitter.on('startedList', wrapRender(data => { state.startedNums = data; }))

  function dbReviewed(num, object, date, result, proposedAnswer) {
    // If Lovefield is updated with `state`, it may have mutated before
    // this Promise is run! Mutable state eeek! So call it with a scalar
    // which is call-by-value.
    koredb.insert()
        .into(quizTable)
        .values([ quizTable.createRow({
          num : num,
          date : date,
          result : result,
          proposedAnswer : proposedAnswer || null
        }) ])
        .exec()
        .catch(err => console.log('ERROR updating quizTable:', err));
    koredb.update(factTable)
        .set(factTable.started, true)
        .set(factTable.recallObject, object)
        .set(factTable.lastQuizTime, date)
        .where(factTable.num.eq(num))
        .exec()
        .catch(err => console.log('ERROR updating factTable:', err));
  }
  
  function prevNextLearnable(num, skippedNums, startedNums, direction) {
    // direction: -1 or +1
    var curr = num || 1;
    var init = curr + direction;
    for (let i = init; i > 0 && i <= tono.length; i += direction) {
      if (!skippedNums.has(i) && !startedNums.has(i)) {
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
  <button onclick=${tellClick}>Tell me what to do</button>
  <button onclick=${learnClick}>Learn me</button>
  <button onclick=${hitClick}>Quiz me</button>
  <button onclick=${showClick}>Show all</button>
  ${raw}
  </div>`;

  function tellClick(e) { emit('quizOrLearn'); }
  function hitClick(e) { emit('pickedQuiz', pickQuiz(state.startedNums)); }
  function learnClick(e) { emit('nextLearnable', 1); }
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
  var fact = tono[num - 1];
  var register = fact.register ? html`<li>
  Top word in the <em>${registerToFull[fact.register]}</em> register.
  </li>`
                               : '';
  return html`<div>
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
  <p>
  <button onclick=${learnedClick}>I HAVE LEARNED THIS!</button>
  Or… skip learning this fact?
  Jump to <button onclick=${prevClick}>Previous</button> or
  <button onclick=${nextClick}>Next</button> unlearned + unskipped fact.
  </p>

  </div>`;

  function learnedClick() { emit('doneLearning'); }
  function prevClick() { emit('previousLearnable', num); }
  function nextClick() { emit('nextLearnable', num); }
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
  var skipped = o => state.skippedNums.has(o.num) ? 'skipped' : 'learnable';
  var started = o => state.startedNums.has(o.num) ? 'started' : 'unstarted';
  var renderedFacts =
      tono.map(o => html`<li class="${skipped(o)} ${started(o)}">
      
      <button choo-num=${o.num} onclick=${click}>Study</button>
      
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
  ${JSON.stringify(tono[picked[0] - 1])}
  </div>`;
}

// Administer a quiz
function administerQuiz(picked, emit) {
  var [num, field] = picked;
  var fact = tono[num - 1];
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
  var btn = (i) => html`<button choo-num=${i} onclick=${accept}>x</button>`;
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
      You have to guess #${num}’s ${field}! Soooo, ${clues}! Is it:
      <ol>
      ${confusers}
      </ol>
  </div>`;

  function accept(e) {
    var proposal = e.target.getAttribute('choo-num');
    emit('proposeAnswer', +proposal);
  }
}

function lowestRecallProb(startedNums) {
  console.log(startedNums);
  var minFound = false;
  var minRecallProb = 1.1;
  var numMinRecallProb = -1;
  for (let [num, {recallObject, lastQuizTime}] of startedNums) {
    let prob = ebisu.predictRecall(recallObject, hoursElapsed(lastQuizTime));
    console.log('num', num, 'prob', prob);
    if (prob < minRecallProb) {
      minRecallProb = prob;
      numMinRecallProb = num;
      minFound = true;
    }
  }
  return {numMinRecallProb, minRecallProb, minFound};
}

function pickSubQuiz(num) {
  let topics = [ 'readings', 'meaning' ];
  if (tono[num - 1].kanjis.length) {
    topics.push('kanjis');
  }
  return topics[randi(topics.length)];
}

// Pick a fact (and any specifics, like sub-fact) to quiz
function pickQuiz(startedNums) {
  var {minFound, numMinRecallProb} = lowestRecallProb(startedNums);
  if (minFound) {
    return {
      found : true,
      num : numMinRecallProb,
      topic : pickSubQuiz(numMinRecallProb)
    };
  }
  return {found : false};
}

// Utilities

function randomFactWithKanji(not) {
  if (typeof not === 'undefined') {
    not = -1;
  }
  while (true) {
    var idx = randi(tono.length);
    if (tono[idx].kanjis.length > 0 && tono[idx].num !== not) {
      return idx
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