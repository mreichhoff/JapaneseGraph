import { faqTypes, showFaq } from "./faq.js";
import { updateVisited, getVisited, addCards, inStudyList, getCardPerformance } from "./data-layer.js";
import { addToGraph, initializeGraph, setLevelProperty, updateColorScheme } from "./graph.js";
import { levelPropertyChanged, preferencesChanged } from "./recommendations.js";

//TODO break this down further
//refactor badly needed...hacks on top of hacks at this point
let maxExamples = 5;
let currentExamples = {};
let currentKanji = null;
let currentWord = null;
let tabs = {
    explore: 'explore',
    study: 'study'
};
let activeTab = tabs.explore;

let characterLegend = ['N5', 'N4', 'N3', 'N2', 'N1'];
let freqLegend = ['Top1k', 'Top2k', 'Top4k', 'Top7k', 'Top10k'];
const legendContainer = document.getElementById('legend');
let legendElements = document.querySelectorAll('div.circle');
let graphOptions = {
    character: {
        display: 'JLPT Level', legend: characterLegend, levelProperty: 'char_level'
    },
    word: {
        display: 'Word Frequency', legend: freqLegend, levelProperty: 'word_level'
    }
};
let activeGraph = graphOptions.word;
let getActiveGraph = function () {
    return activeGraph;
}

//top-level section container
const mainContainer = document.getElementById('main-container');
const graphContainer = document.getElementById('graph-container');

const exploreTab = document.getElementById('show-explore');
const studyTab = document.getElementById('show-study');

const mainHeader = document.getElementById('main-header');

//study items...these may not belong in this file
const studyContainer = document.getElementById('study-container');

//explore tab items
const examplesList = document.getElementById('examples');
const exampleContainer = document.getElementById('explore-container');
//explore tab navigation controls
const kanjiBox = document.getElementById('kanji-box');
const kanjiSearchForm = document.getElementById('kanji-choose');
const notFoundElement = document.getElementById('not-found-message');

//recommendations
const recommendationsDifficultySelector = document.getElementById('recommendations-difficulty');

const walkThrough = document.getElementById('walkthrough');

//menu items
const graphSelector = document.getElementById('graph-selector');
const levelSelector = document.getElementById('level-selector');
const menuButton = document.getElementById('menu-button');
const menuContainer = document.getElementById('menu-container');
const menuExitButton = document.getElementById('menu-exit-button');
const showTranscriptCheckbox = document.getElementById('show-transcript');
const toggleTranscriptLabel = document.getElementById('toggle-transcript-label');

let getTtsVoice = function () {
    //use the first-encountered ja-JP voice for now
    return speechSynthesis.getVoices().find(voice => voice.lang === "ja-JP" || voice.lang === 'ja_JP');
};
let ttsVoice = getTtsVoice();
//TTS voice option loading appears to differ in degree of asynchronicity by browser...being defensive
speechSynthesis.onvoiceschanged = function () {
    ttsVoice = getTtsVoice();
};

let runTextToSpeech = function (text, anchors) {
    ttsVoice = ttsVoice || getTtsVoice();
    //TTS voice option loading appears to differ in degree of asynchronicity by browser...being defensive
    if (ttsVoice) {
        let utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = ttsVoice.lang;
        utterance.voice = ttsVoice;
        speechSynthesis.speak(utterance);
    }
};

let addTextToSpeech = function (holder, text, aList) {
    let textToSpeechButton = document.createElement('span');
    textToSpeechButton.className = 'volume';
    textToSpeechButton.addEventListener('click', runTextToSpeech.bind(this, text, aList), false);
    holder.appendChild(textToSpeechButton);
};
let addSaveToListButton = function (holder, text) {
    let buttonTexts = ['✔️', '+'];
    let saveToListButton = document.createElement('span');
    saveToListButton.className = 'add-button';
    saveToListButton.textContent = inStudyList(text) ? buttonTexts[0] : buttonTexts[1];
    saveToListButton.addEventListener('click', function () {
        addCards(currentExamples, text);
        saveToListButton.textContent = buttonTexts[0];
    });
    holder.appendChild(saveToListButton);
};

let persistState = function () {
    localStorage.setItem('state', JSON.stringify({
        word: currentWord,
        activeTab: activeTab,
        currentGraph: activeGraph.display,
        graphPrefix: activeGraph.prefix
    }));
};

function parseUrl(path) {
    if (path[0] === '/') {
        path = path.substring(1);
    }
    const segments = path.split('/');
    if (segments.length === 1) {
        return { word: segments[0] };
    }
    return null;
}
function loadState(word) {
    const term = decodeURIComponent(word || '');
    kanjiBox.value = term;
    search(term, levelSelector.value, true);
}

window.onpopstate = (event) => {
    const state = event.state;
    if (!state || !state.word) {
        walkThrough.removeAttribute('style');
        examplesList.innerHTML = '';
        hanziBox.value = '';
        return;
    }
    loadState(state.word);
};

let setupDefinitions = function (definitionList, definitionHolder) {
    for (let i = 0; i < definitionList.length; i++) {
        let definitionItem = document.createElement('li');
        definitionItem.classList.add('definition');
        let definitionContent = definitionList[i].join('; ');
        definitionItem.textContent = definitionContent;
        definitionHolder.appendChild(definitionItem);
    }
};
let findExamples = function (word) {
    let examples = [];
    //TODO consider indexing up front
    //can also reuse inner loop...consider inverting
    for (let i = 0; i < sentences.length; i++) {
        if (sentences[i].ja.includes(word) || (word.length === 1 && sentences[i].ja.join('').includes(word))) {
            examples.push(sentences[i]);
            if (examples.length === maxExamples) {
                break;
            }
        }
    }
    return examples;
};
let setupExampleElements = function (examples, exampleList) {
    for (let i = 0; i < examples.length; i++) {
        let exampleHolder = document.createElement('li');
        exampleHolder.classList.add('example');
        let jaHolder = document.createElement('p');
        let exampleText = examples[i].ja.join('');
        let aList = makeSentenceNavigableWithTranscription(examples[i], jaHolder);
        jaHolder.className = 'target';
        addTextToSpeech(jaHolder, exampleText, aList);
        exampleHolder.appendChild(jaHolder);
        let enHolder = document.createElement('p');
        enHolder.textContent = examples[i].en;
        enHolder.className = 'base';
        exampleHolder.appendChild(enHolder);
        exampleList.appendChild(exampleHolder);
    }
};
let setupExamples = function (words) {
    currentExamples = {};
    walkThrough.style.display = 'none';
    //TODO this mixes markup modification and example finding
    //refactor needed
    while (examplesList.firstChild) {
        examplesList.firstChild.remove();
    }
    for (let i = 0; i < words.length; i++) {
        let examples = findExamples(words[i]);
        currentExamples[words[i]] = [];

        let item = document.createElement('li');
        let wordHolder = document.createElement('h2');
        wordHolder.classList.add('word-header')
        wordHolder.textContent = words[i];
        addTextToSpeech(wordHolder, words[i], []);
        addSaveToListButton(wordHolder, words[i]);
        item.appendChild(wordHolder);

        let definitionHolder = document.createElement('ul');
        definitionHolder.className = 'definitions';
        let definitionList = definitions[words[i]] || [];
        setupDefinitions(definitionList, definitionHolder);
        item.appendChild(definitionHolder);

        let contextHolder = document.createElement('p');
        contextHolder.className = 'context';
        //TODO not so thrilled with 'context' as the name here
        contextHolder.className = 'context';
        contextHolder.innerText += "Previously: ";
        [...words[i]].forEach(x => {
            if (kanji[x]) {
                let cardData = getCardPerformance(x);
                contextHolder.innerText += `${x} seen ${getVisited()[x] || 0} times; in ${cardData.count} flash cards (${cardData.performance}% correct). `;
            }
        });
        let contextFaqLink = document.createElement('a');
        contextFaqLink.className = 'faq-link';
        contextFaqLink.textContent = "Learn more.";
        contextFaqLink.addEventListener('click', function () {
            showFaq(faqTypes.context);
        });
        contextHolder.appendChild(contextFaqLink);
        item.appendChild(contextHolder);

        //TODO: definition list doesn't have the same interface (missing ja field)
        currentExamples[words[i]].push(getCardFromDefinitions(words[i], definitionList));
        //setup current examples for potential future export
        currentExamples[words[i]].push(...examples);

        let exampleList = document.createElement('ul');
        item.appendChild(exampleList);
        setupExampleElements(examples, exampleList);

        examplesList.append(item);
    }
    currentWord = words;
};

//TODO can this be combined with the definition rendering part?
let getCardFromDefinitions = function (text, definitionList) {
    //this assumes definitionList non null
    let result = { ja: [text] };
    let answer = '';
    for (let i = 0; i < definitionList.length; i++) {
        answer += definitionList[i].join(', ');
        answer += i == definitionList.length - 1 ? '' : '; ';
    }
    result['en'] = answer;
    return result;
};

let nodeTapHandler = function (evt) {
    let id = evt.target.id();
    let maxLevel = levelSelector.value;
    //not needed if currentKanji contains id, which would mean the nodes have already been added
    //includes O(N) but currentKanji almost always < 10 elements
    if (currentKanji && !currentKanji.includes(id)) {
        addToExistingGraph(id, maxLevel);
    }
    setupExamples([id]);
    persistNavigationState();
    exploreTab.click();
    mainHeader.scrollIntoView();
    updateVisited([id]);
    notFoundElement.style.display = 'none';
};
let edgeTapHandler = function (evt) {
    let words = evt.target.data('words');
    setupExamples(words);
    persistNavigationState();
    //TODO toggle functions
    exploreTab.click();
    mainHeader.scrollIntoView();
    updateVisited([evt.target.source().id(), evt.target.target().id()]);
    notFoundElement.style.display = 'none';
};
let addToExistingGraph = function (character, maxLevel) {
    addToGraph(character, maxLevel);
    //currentKanji must be set up before this call
    currentKanji.push(character);
};
let updateGraph = function (value, maxLevel) {
    document.getElementById('graph').remove();
    let nextGraph = document.createElement("div");
    nextGraph.id = 'graph';
    //TODO: makes assumption about markup order
    graphContainer.insertBefore(nextGraph, legendContainer);

    if (value && kanji[value]) {
        initializeGraph(value, maxLevel, nextGraph, nodeTapHandler, edgeTapHandler);
        currentKanji = [value];
        persistState();
    }
};

let getAppropriateWord = function (urlState, historyState, storedState) {
    return urlState ? urlState.word : historyState ? historyState.word : storedState ? storedState.word : '';
};

let initialize = function () {
    let parsedUrl = null;
    if (document.location.pathname !== '/') {
        parsedUrl = parseUrl(document.location.pathname);
    }
    let oldState = JSON.parse(localStorage.getItem('state')) || {};
    let word = getAppropriateWord(parsedUrl, history.state, oldState);

    if (!word) {
        //graph chosen is default, no need to modify legend or dropdown
        //add a default graph on page load to illustrate the concept
        let defaultKanji = ["遠", "応", "援"];
        updateGraph(defaultKanji[Math.floor(Math.random() * defaultKanji.length)], levelSelector.value);
        walkThrough.removeAttribute('style');
    } else {
        if (oldState.currentGraph) {
            // TODO so dumb, just save the key and put values on this
            let activeGraphKey = Object.keys(graphOptions).find(x => graphOptions[x].display === oldState.currentGraph);
            activeGraph = graphOptions[activeGraphKey];
            legendElements.forEach((x, index) => {
                x.innerText = activeGraph.legend[index];
            });
            graphSelector.value = oldState.currentGraph;
        }
        loadState(word);
    }
    if (oldState.activeTab === tabs.study) {
        //reallllllly need a toggle method
        //this does set up the current card, etc.
        studyTab.click();
    }
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", updateColorScheme);
};

// oh no, what have I done
let parseExample = function (example) {
    let result = [];
    if (!example.fu) {
        for (let i = 0; i < example.ja.length; i++) {
            result.push({ text: example.ja[i] });
        }
        return result;
    }
    let splitByTranscripts = example.fu.split('[');
    for (let i = 0; i < splitByTranscripts.length; i++) {
        if (splitByTranscripts[i].includes(']')) {
            let splitByEndBracket = splitByTranscripts[i].split(']');
            let splitByBar = splitByEndBracket[0].split('|');
            let kanji = splitByBar[0];
            for (let j = 0; j < kanji.length; j++) {
                if (j + 1 < splitByBar.length) {
                    result.push({
                        text: kanji[j], transcription: splitByBar[j + 1]
                    });
                } else {
                    result.push({ text: kanji[j] });
                }
            }
            if (splitByEndBracket.length > 1) {
                for (let j = 0; j < splitByEndBracket[1].length; j++) {
                    result.push({
                        text: splitByEndBracket[1][j]
                    });
                }
            }
        } else {
            for (let j = 0; j < splitByTranscripts[i].length; j++) {
                result.push({
                    text: splitByTranscripts[i][j]
                });
            }
        }
    }
    return result;
};

let makeSentenceNavigableWithTranscription = function (example, container) {
    let sentenceContainer = document.createElement('span');
    sentenceContainer.className = "sentence-container";
    let text = parseExample(example);
    let anchorList = [];
    for (let i = 0; i < text.length; i++) {
        (function (character) {
            let a = document.createElement('a');
            if (character.transcription) {
                let transcriptElement = document.createElement('ruby');
                transcriptElement.textContent = character.text;
                let openingRp = document.createElement('rp');
                openingRp.textContent = '(';
                transcriptElement.appendChild(openingRp);
                let rt = document.createElement('rt');
                rt.textContent = character.transcription;
                transcriptElement.appendChild(rt);
                let closingRp = document.createElement('rp');
                closingRp.textContent = ')';
                transcriptElement.appendChild(closingRp);
                a.appendChild(transcriptElement);
            } else {
                a.textContent = character.text;
            }
            if (kanji[character.text]) {
                a.className = 'navigable';
            }
            a.addEventListener('click', function () {
                if (kanji[character.text]) {
                    if (currentKanji && !currentKanji.includes(character.text)) {
                        updateGraph(character.text, levelSelector.value);
                    }
                    persistState();
                }
            });
            anchorList.push(a);
            sentenceContainer.appendChild(a);
        }(text[i]));
    }
    container.appendChild(sentenceContainer);
    return anchorList;
};

let makeSentenceNavigable = function (text, container, noExampleChange) {
    let sentenceContainer = document.createElement('span');
    sentenceContainer.className = "sentence-container";

    let anchorList = [];
    for (let i = 0; i < text.length; i++) {
        (function (character) {
            let a = document.createElement('a');
            a.textContent = character;
            if (kanji[character]) {
                a.className = 'navigable';
            }
            a.addEventListener('click', function () {
                if (kanji[character]) {
                    if (currentKanji && !currentKanji.includes(character)) {
                        updateGraph(character, levelSelector.value);
                    }
                    //enable seamless switching, but don't update if we're already showing examples for character
                    if (!noExampleChange && (!currentWord || (currentWord.length !== 1 || currentWord[0] !== character))) {
                        setupExamples([character]);
                        persistNavigationState();
                    }
                }
            });
            anchorList.push(a);
            sentenceContainer.appendChild(a);
        }(text[i]));
    }
    container.appendChild(sentenceContainer);
    return anchorList;
};

let addEdges = function (word) {
    for (let i = 0; i < word.length; i++) {
        let curr = word[i];
        if (!kanji[curr]) { continue; }
        for (let j = 0; j < word.length; j++) {
            if (i === j || !kanji[word[j]]) { continue; }
            if (!kanji[curr].edges[word[j]]) {
                kanji[curr].edges[word[j]] = {
                    // TODO stop hardcoding 5
                    word_level: 5,
                    char_level: 5,
                    words: []
                };
            }
            // not that efficient, but we almost never see more than 5 items in words, so NBD
            if (kanji[curr].edges[word[j]].words.indexOf(word) < 0) {
                kanji[curr].edges[word[j]].words.push(word);
            }
        }
    }
};

// build a graph based on a word rather than just a character like updateGraph
let buildGraph = function (value, maxLevel) {
    let ranUpdate = false;
    // we don't necessarily populate all via the script
    addEdges(value);
    // TODO: add non-kanji words in `sentences` to wordSet and definitions
    // then, add an else on the `wordSet.has(value)` for when we don't have it.
    // In that case, fetch definition + examples. Ideally make it rare to enter
    // a word and have it not find something for it. Also add not found handling
    for (let i = 0; i < value.length; i++) {
        if (kanji[value[i]]) {
            if (!ranUpdate) {
                ranUpdate = true;
                updateGraph(value[i], maxLevel);
            } else {
                addToExistingGraph(value[i], maxLevel);
            }
        }
    }
};
let persistNavigationState = function () {
    const newUrl = `/${currentWord}`;
    history.pushState({
        word: currentWord,
    }, '', newUrl);
    // keep UI state around too, I guess?
    persistState();
};

let search = function (value, maxLevel, skipState) {
    if (value && (wordSet.has(value) || definitions[value])) {
        notFoundElement.style.display = 'none';
        buildGraph(value, maxLevel);
        setupExamples([value]);
        if (!skipState) {
            persistNavigationState();
        }
        updateVisited([value]);
    } else {
        notFoundElement.removeAttribute('style');
    }
};

kanjiSearchForm.addEventListener('submit', function (event) {
    event.preventDefault();
    search(kanjiBox.value, levelSelector.value);
});

levelSelector.addEventListener('change', function () {
    //TODO hide edges in existing graph rather than rebuilding
    //TODO refresh after level change can be weird
    updateGraph(currentKanji[currentKanji.length - 1], levelSelector.value);
});

showTranscriptCheckbox.addEventListener('change', function () {
    let toggleLabel = toggleTranscriptLabel;
    if (showTranscriptCheckbox.checked) {
        toggleLabel.innerText = 'Turn off furigana in examples';
    } else {
        toggleLabel.innerText = 'Turn on furigana in examples';
    }
});
exploreTab.addEventListener('click', function () {
    exampleContainer.removeAttribute('style');
    studyContainer.style.display = 'none';
    //TODO could likely do all of this with CSS
    exploreTab.classList.add('active');
    studyTab.classList.remove('active');
    activeTab = tabs.explore;
    persistState();
});

studyTab.addEventListener('click', function () {
    exampleContainer.style.display = 'none';
    studyContainer.removeAttribute('style');
    studyTab.classList.add('active');
    exploreTab.classList.remove('active');
    activeTab = tabs.study;
    persistState();
});

recommendationsDifficultySelector.addEventListener('change', function () {
    let val = recommendationsDifficultySelector.value;
    preferencesChanged(val);
});

menuButton.addEventListener('click', function () {
    mainContainer.style.display = 'none';
    menuContainer.removeAttribute('style');
});
menuExitButton.addEventListener('click', function () {
    menuContainer.style.display = 'none';
    mainContainer.removeAttribute('style');
});

let switchGraph = function () {
    let value = graphSelector.value;
    if (value !== activeGraph.display) {
        let key = Object.keys(graphOptions).find(x => graphOptions[x].display === value);
        activeGraph = graphOptions[key];
        setLevelProperty(activeGraph.levelProperty);
        levelPropertyChanged(activeGraph.levelProperty);
        legendElements.forEach((x, index) => {
            x.innerText = activeGraph.legend[index];
        });
        persistState();
    }
}

graphSelector.addEventListener('change', switchGraph);

export { initialize, makeSentenceNavigable, addTextToSpeech, getActiveGraph };