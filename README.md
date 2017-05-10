# 5kore

5kore is
- a simple flashcard app for learning the top-5000 words in Japanese, according to [Tono, Yamazaki, and Maekawa](https://www.routledge.com/A-Frequency-Dictionary-of-Japanese/Tono-Yamazaki-Maekawa/p/book/9780415610131)’s *A Frequency Dictionary of Japanese* (2013).
- a skeletal client-side JavaScript app powered by [Choo](https://choo.io), [Lovefield](https://github.com/google/lovefield) database, and my [Ebisu.js](https://fasiha.github.io/ebisu.js/) library.

[Try 5kore now.](https://fasiha.github.io/5kore/)

After loading the data, you will see all 5000 words in Tono, et al.’s frequency list. I’ve grayed out the particles, interjections, and other extremely common words whose ambiguity make for bad quizzes. All nouns, verbs, adjectives, etc., are black and can be learned in order. (You can still learn the grayed out entries, but you have to do so manually.)

You can focus on only learning new words or only reviewing words you’ve already learned via the buttons at the top. Or you can use the “Tell me what to do” button—you’ll be presented with new words to learn until one of the words you’ve learned drops into a memory danger zone. (If you know how [Ebisu.js](https://fasiha.github.io/ebisu.js/) works, this happens when the predicted recall probability drops to 50%.) In this case, you’re quizzed on that word.

Quizzes are multiple-choice. You have to choose the right
1. reading (pronunciation), or
2. meaning, or 
3. if available, kanji

for each review. (**Right now, during debug phases, quizzes include the right answer 😝, that will go away soon!**)

## Coming soon

### Japanese features

☐ Better furigana via [jmdict-furigana](https://github.com/Doublevil/JmdictFurigana).

☐ Fine-tune the set of skipped-words (currently around 300 words, out of 5000). Make sure they don’t contain anything easily-tested.

☐ Tentative: develop a way to measure “distance” between words, so that the system may suggest you learn words that are similar to words you’ve already learned, rather than going through the list in frequency-order. This could be useful in quizzing, where options in multiple-choice quizzes can be more carefully chosen (right now they are selected randomly).

☐ Smarter way to select which aspect of the word to quiz on, i.e., reading/meaning/kanji (last if the word has any kanji). This too is currently random.

### Tech features

☐ Mobile support, i.e., use *some* CSS, Ahmed…

☐ More than multiple-choice quizzes. Planned: text entry for reading quizzes (i.e., enter hiragana or katanana). More tentative: draw kanji and be graded on stroke order (this is harder).

☐ Sync. Right now your quiz results are stored by Lovefield in your browser. I’m looking for a nice (ideally p2p and decentralized) way to synchronize your progress between devices.

☐ Important meta-goal: abstract this app so it can be remixed (via [Glitch.me](https://glitch.com) perhaps) to easily create new apps for different material beyond simple vocabular, like sentence patterns or audio, etc. It’s not at all clear how I could separate the rendering (via Choo), the source data (a JSON file via a TSV (tab-separated values) file), database, and scheduling, but if you’re familiar with [Anki](https://apps.ankiweb.net), you know how easy it is to create new “flashcard decks” with it. I’d like to make it easy to create “flashcard apps”.

☐ Port to PureScript or Elm. I’m hoping to iron out the backend requirements before switching to a more rigorous language.

## License

Unlicense. This software is truly free. Comments and questions are gratefully accepted.
