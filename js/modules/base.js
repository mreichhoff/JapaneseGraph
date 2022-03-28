import { faqTypes, showFaq } from "./faq.js";
import { updateVisited, getVisited, addCards, getCardCount, inStudyList } from "./data-layer.js";
import { addToGraph, initializeGraph, setLevelProperty, updateColorScheme } from "./graph.js";
import { graphChanged, preferencesChanged } from "./recommendations.js";

//TODO break this down further
//refactor badly needed...hacks on top of hacks at this point
let maxExamples = 5;
let currentExamples = {};
let currentHanzi = null;
let currentWord = null;
let undoChain = [];
let tabs = {
    explore: 'explore',
    study: 'study'
};
let activeTab = tabs.explore;

let characterLegend = ['N5', 'N4', 'N3', 'N2', 'N1'];
let freqLegend = ['Top1k', 'Top2k', 'Top4k', 'Top7k', 'Top10k'];
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
const mainContainer = document.getElementById('container');

const exploreTab = document.getElementById('show-explore');
const studyTab = document.getElementById('show-study');

const mainHeader = document.getElementById('main-header');

//study items...these may not belong in this file
const studyContainer = document.getElementById('study-container');

//explore tab items
const examplesList = document.getElementById('examples');
const exampleContainer = document.getElementById('example-container');
//explore tab navigation controls
const hanziBox = document.getElementById('hanzi-box');
const hanziSearchForm = document.getElementById('hanzi-choose');
const previousHanziButton = document.getElementById('previousHanziButton');
//recommendations
const recommendationsDifficultySelector = document.getElementById('recommendations-difficulty');

//menu items
const graphSelector = document.getElementById('graph-selector');
const levelSelector = document.getElementById('level-selector');
const menuButton = document.getElementById('menu-button');
const menuContainer = document.getElementById('menu-container');
const menuExitButton = document.getElementById('menu-exit-button');

let getTtsVoice = function () {
    //use the first-encountered ja-JP voice for now
    return speechSynthesis.getVoices().find(voice => voice.lang === "ja-JP");
};
let ttsVoice = getTtsVoice();
//TTS voice option loading appears to differ in degree of asynchronicity by browser...being defensive
speechSynthesis.onvoiceschanged = function () {
    if (!ttsVoice) {
        ttsVoice = getTtsVoice();
    }
};

let runTextToSpeech = function (text, anchors) {
    ttsVoice = ttsVoice || getTtsVoice();
    //TTS voice option loading appears to differ in degree of asynchronicity by browser...being defensive
    if (ttsVoice) {
        let utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "ja-JP";
        utterance.voice = ttsVoice;
        utterance.addEventListener('boundary', function (event) {
            if (event.charIndex == null || event.charLength == null) {
                return false;
            }
            for (let i = event.charIndex; i < event.charIndex + event.charLength; i++) {
                anchors[i].style.fontWeight = 'bold';
            }
            // anchors.forEach((character, index) => {
            //     if (index >= event.charIndex && index < (event.charIndex + (event.charLength || 1))) {
            //         character.style.fontWeight = 'bold';
            //     } else {
            //         character.style.fontWeight = 'normal';
            //     }
            // });
        });
        utterance.addEventListener('end', function () {
            anchors.forEach(character => {
                character.style.fontWeight = 'normal';
            });
        });
        speechSynthesis.speak(utterance);
    }
};

let addTextToSpeech = function (holder, text, aList) {
    let textToSpeechButton = document.createElement('span');
    textToSpeechButton.className = 'text-button listen';
    textToSpeechButton.textContent = 'Listen';
    textToSpeechButton.addEventListener('click', runTextToSpeech.bind(this, text, aList), false);
    holder.appendChild(textToSpeechButton);
};
let addSaveToListButton = function (holder, text) {
    let buttonTexts = ['In your study list!', 'Add to study list'];
    let saveToListButton = document.createElement('span');
    saveToListButton.className = 'text-button';
    saveToListButton.textContent = inStudyList(text) ? buttonTexts[0] : buttonTexts[1];
    saveToListButton.addEventListener('click', function () {
        addCards(currentExamples, text);
        saveToListButton.textContent = buttonTexts[0];
    });
    holder.appendChild(saveToListButton);
};

let persistState = function () {
    let localUndoChain = undoChain.length > 5 ? undoChain.slice(0, 5) : undoChain;
    localStorage.setItem('state', JSON.stringify({
        hanzi: currentHanzi,
        word: currentWord,
        level: levelSelector.value,
        undoChain: localUndoChain,
        activeTab: activeTab,
        currentGraph: activeGraph.display,
        graphPrefix: activeGraph.prefix
    }));
};
let setupDefinitions = function (definitionList, definitionHolder) {
    for (let i = 0; i < definitionList.length; i++) {
        let definitionItem = document.createElement('li');
        let definitionContent = definitionList[i].transcript + ': ' + definitionList[i].en;
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
    //TODO...improve
    examples.sort((a, b) => {
        if (a.en && !b.en) {
            return -1;
        } else if (!a.en && b.en) {
            return 1;
        } else {
            return a.ja.length - b.ja.length;
        }
    });
    return examples;
};
let setupExampleElements = function (examples, exampleList) {
    for (let i = 0; i < examples.length; i++) {
        let exampleHolder = document.createElement('li');
        let jaHolder = document.createElement('p');
        let exampleText = examples[i].ja.join('');
        let aList = makeSentenceNavigable(exampleText, jaHolder, true);
        jaHolder.className = 'ja-example example-line';
        addTextToSpeech(jaHolder, exampleText, aList);
        exampleHolder.appendChild(jaHolder);
        let enHolder = document.createElement('p');
        enHolder.textContent = examples[i].en;
        enHolder.className = 'example-line';
        exampleHolder.appendChild(enHolder);
        exampleList.appendChild(exampleHolder);
    }
};
let setupExamples = function (words) {
    currentExamples = {};
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
        wordHolder.textContent = words[i];
        addTextToSpeech(wordHolder, words[i], []);
        addSaveToListButton(wordHolder, words[i]);
        item.appendChild(wordHolder);

        let definitionHolder = document.createElement('ul');
        definitionHolder.className = 'definition';
        let definitionList = definitions[words[i]] || [];
        setupDefinitions(definitionList, definitionHolder);
        item.appendChild(definitionHolder);

        let contextHolder = document.createElement('p');
        //TODO not so thrilled with 'context' as the name here
        contextHolder.className = 'context';
        contextHolder.innerText += "Previously: ";
        [...words[i]].forEach(x => {
            contextHolder.innerText += `${x} seen ${getVisited()[x] || 0} times; in ${getCardCount(x)} flash cards. `;
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
let updateUndoChain = function () {
    //push clones onto the stack
    undoChain.push({ hanzi: [...currentHanzi], word: (currentWord ? [...currentWord] : currentWord) });
};

//TODO can this be combined with the definition rendering part?
let getCardFromDefinitions = function (text, definitionList) {
    //this assumes definitionList non null
    let result = { ja: [text] };
    let answer = '';
    for (let i = 0; i < definitionList.length; i++) {
        answer += definitionList[i].transcript + ': ' + definitionList[i].en;
        answer += i == definitionList.length - 1 ? '' : ', ';
    }
    result['en'] = answer;
    return result;
};

let nodeTapHandler = function (evt) {
    let id = evt.target.id();
    let maxLevel = levelSelector.value;
    updateUndoChain();
    //not needed if currentHanzi contains id, which would mean the nodes have already been added
    //includes O(N) but currentHanzi almost always < 10 elements
    if (currentHanzi && !currentHanzi.includes(id)) {
        addToExistingGraph(id, maxLevel);
    }
    setupExamples([id]);
    persistState();
    exploreTab.click();
    mainHeader.scrollIntoView();
    updateVisited([id]);
};
let edgeTapHandler = function (evt) {
    let words = evt.target.data('words');
    updateUndoChain();
    setupExamples(words);
    persistState();
    //TODO toggle functions
    exploreTab.click();
    mainHeader.scrollIntoView();
    updateVisited([evt.target.source().id(), evt.target.target().id()]);
};
let addToExistingGraph = function (character, maxLevel) {
    addToGraph(character, maxLevel);
    //currentHanzi must be set up before this call
    currentHanzi.push(character);
};
let updateGraph = function (value, maxLevel) {
    document.getElementById('graph').remove();
    let nextGraph = document.createElement("div");
    nextGraph.id = 'graph';
    //TODO: makes assumption about markup order
    mainContainer.append(nextGraph);

    if (value && hanzi[value]) {
        initializeGraph(value, maxLevel, nextGraph, nodeTapHandler, edgeTapHandler);
        currentHanzi = [value];
        persistState();
    }
};

let initialize = function () {
    let oldState = JSON.parse(localStorage.getItem('state'));
    if (!oldState) {
        //graph chosen is default, no need to modify legend or dropdown
        //add a default graph on page load to illustrate the concept
        let defaultHanzi = ["成"];
        updateGraph(defaultHanzi[Math.floor(Math.random() * defaultHanzi.length)], levelSelector.value);
    } else {
        if (state.currentGraph) {
            let activeGraphKey = Object.keys(graphOptions).find(x => graphOptions[x].display === state.currentGraph);
            activeGraph = graphOptions[activeGraphKey];
            legendElements.forEach((x, index) => {
                x.innerText = activeGraph.legend[index];
            });
            graphSelector.value = state.currentGraph;
        }
        levelSelector.value = oldState.level;
        //oldState.hanzi should always have length >= 1
        updateGraph(oldState.hanzi[0], oldState.level);
        for (let i = 1; i < oldState.hanzi.length; i++) {
            addToExistingGraph(oldState.hanzi[i], oldState.level);
        }
        if (oldState.word) {
            setupExamples(oldState.word);
        }
        undoChain = oldState.undoChain;
        if (oldState.activeTab === tabs.study) {
            //reallllllly need a toggle method
            //this does set up the current card, etc.
            studyTab.click();
        }
        persistState();
    }
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", updateColorScheme);
};

let makeSentenceNavigable = function (text, container, noExampleChange) {
    let sentenceContainer = document.createElement('span');
    sentenceContainer.className = "sentence-container";

    let anchorList = [];
    for (let i = 0; i < text.length; i++) {
        (function (character) {
            let a = document.createElement('a');
            a.textContent = character;
            a.addEventListener('click', function () {
                if (hanzi[character]) {
                    let updated = false;
                    if (currentHanzi && !currentHanzi.includes(character)) {
                        updateUndoChain();
                        updated = true;
                        updateGraph(character, levelSelector.value);
                    }
                    //enable seamless switching, but don't update if we're already showing examples for character
                    if (!noExampleChange && (!currentWord || (currentWord.length !== 1 || currentWord[0] !== character))) {
                        if (!updated) {
                            updateUndoChain();
                        }
                        setupExamples([character]);
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

hanziSearchForm.addEventListener('submit', function (event) {
    event.preventDefault();
    let value = hanziBox.value;
    let maxLevel = levelSelector.value;
    if (value && hanzi[value]) {
        updateUndoChain();
        updateGraph(value, maxLevel);
        setupExamples([value]);
        persistState();
        updateVisited([value]);
    }
});

levelSelector.addEventListener('change', function () {
    //TODO hide edges in existing graph rather than rebuilding
    //TODO refresh after level change can be weird
    updateGraph(currentHanzi[currentHanzi.length - 1], levelSelector.value);
});

previousHanziButton.addEventListener('click', function () {
    if (!undoChain.length) {
        return;
    }
    let next = undoChain.pop();
    let maxLevel = levelSelector.value;
    updateGraph(next.hanzi[0], maxLevel);
    for (let i = 1; i < next.hanzi.length; i++) {
        addToExistingGraph(next.hanzi[i], maxLevel);
    }
    if (next.word) {
        setupExamples(next.word);
    }
    persistState();
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
        legendElements.forEach((x, index) => {
            x.innerText = activeGraph.legend[index];
        });
        persistState();
    }
}

graphSelector.addEventListener('change', switchGraph);

export { initialize, makeSentenceNavigable, addTextToSpeech, getActiveGraph };