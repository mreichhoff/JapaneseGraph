import { makeSentenceNavigable, addTextToSpeech } from "./base.js";
import { dataTypes, registerCallback, saveStudyList, getStudyList, findOtherCards, removeFromStudyList, recordEvent, studyResult, updateCard, cardTypes } from "./data-layer.js";

//TODO probably doesn't belong here and should instead be indirected (could also just export from base)
const studyTab = document.getElementById('show-study');

const exportStudyListButton = document.getElementById('exportStudyListButton');
const cardQuestionContainer = document.getElementById('card-question-container');
const cardAnswerContainer = document.getElementById('card-answer-container');
const showAnswerButton = document.getElementById('show-answer-button');
const taskCompleteElement = document.getElementById('task-complete');
const cardsDueElement = document.getElementById('cards-due');
const cardsDueCounter = document.getElementById('card-due-count');
const taskDescriptionElement = document.getElementById('task-description');
const cardAnswerElement = document.getElementById('card-answer');
const wrongButton = document.getElementById('wrong-button');
const rightButton = document.getElementById('right-button');
const deleteCardButton = document.getElementById('delete-card-button');

const relatedCardsContainer = document.getElementById('related-cards-container');
const relatedCardsElement = document.getElementById('related-cards');
const relatedCardQueryElement = document.getElementById('related-card-query');
const cardOldMessageElement = document.getElementById('card-old-message');
const cardNewMessageElement = document.getElementById('card-new-message');
const cardRightCountElement = document.getElementById('card-right-count');
const cardWrongCountElement = document.getElementById('card-wrong-count');
const cardPercentageElement = document.getElementById('card-percentage');
const clozePlaceholderCharacter = "*";
const clozePlaceholder = clozePlaceholderCharacter + clozePlaceholderCharacter + clozePlaceholderCharacter;

// TODO: must match cardTypes, which sucks
// why can't you do: {cardTypes.RECOGNITION: function(){...}}?
const cardRenderers = {
    'recognition': function (currentCard) {
        taskDescriptionElement.innerText = 'What does the text below mean?';
        let question = currentCard.ja.join('');
        let aList = makeSentenceNavigable(question, cardQuestionContainer);
        for (let i = 0; i < aList.length; i++) {
            aList[i].addEventListener('click', displayRelatedCards.bind(this, aList[i]));
        }
        cardQuestionContainer.style.flexDirection = 'row';
        addTextToSpeech(cardQuestionContainer, question, aList);
        cardAnswerElement.textContent = currentCard.en;

    },
    'recall': function (currentCard) {
        let question = currentCard.en;
        let answer = currentCard.ja.join('');
        // so clean, so clean
        if (answer === currentCard.vocabOrigin) {
            taskDescriptionElement.innerText = `Can you match the definitions below to a Japanese word?`;
        } else {
            taskDescriptionElement.innerText = `Can you translate the text below to Japanese?`;
        }
        cardAnswerElement.innerHTML = '';
        let aList = makeSentenceNavigable(answer, cardAnswerElement);
        for (let i = 0; i < aList.length; i++) {
            aList[i].addEventListener('click', displayRelatedCards.bind(this, aList[i]));
        }
        addTextToSpeech(cardAnswerElement, answer, aList);
        cardQuestionContainer.innerText = question;
    },
    'cloze': function (currentCard) {
        taskDescriptionElement.innerText = `Can you replace ${clozePlaceholder} below to match these texts?`;
        let clozedSentence = currentCard.ja.map(x => x === currentCard.vocabOrigin ? clozePlaceholder : x).join('');
        let clozeContainer = document.createElement('p');
        clozeContainer.className = 'cloze-container';
        let aList = makeSentenceNavigable(clozedSentence, clozeContainer);
        for (let i = 0; i < aList.length; i++) {
            // TODO yuck
            if (i >= 2 && aList[i].innerText === clozePlaceholderCharacter && aList[i - 1].innerText === clozePlaceholderCharacter && aList[i - 2].innerText === clozePlaceholderCharacter) {
                aList[i].classList.add('cloze-placeholder');
                aList[i - 1].classList.add('cloze-placeholder');
                aList[i - 2].classList.add('cloze-placeholder');
            }
            aList[i].addEventListener('click', displayRelatedCards.bind(this, aList[i]));
        }
        cardQuestionContainer.style.flexDirection = 'column';
        cardQuestionContainer.appendChild(clozeContainer);
        let clozeAnswerContainer = document.createElement('p');
        clozeAnswerContainer.className = 'cloze-container';
        clozeAnswerContainer.innerText = currentCard.en;
        cardQuestionContainer.appendChild(clozeAnswerContainer);
        cardAnswerElement.innerHTML = '';
        let answerAList = makeSentenceNavigable(currentCard.vocabOrigin, cardAnswerElement);
        for (let i = 0; i < answerAList.length; i++) {
            answerAList[i].addEventListener('click', displayRelatedCards.bind(this, answerAList[i]));
        }
    }
};

let currentKey = null;

let displayRelatedCards = function (anchor) {
    let MAX_RELATED_CARDS = 3;
    let related = findOtherCards(anchor.textContent, currentKey);
    let studyList = getStudyList();
    relatedCardQueryElement.innerText = anchor.textContent;
    if (!related || !related.length) {
        relatedCardsContainer.style.display = 'none';
        return;
    }
    relatedCardsElement.innerHTML = '';
    for (let i = 0; i < Math.min(MAX_RELATED_CARDS, related.length); i++) {
        let item = document.createElement('p');
        item.className = 'related-card';
        item.innerText = related[i];
        let relatedPerf = document.createElement('p');
        relatedPerf.className = 'related-card-performance';
        relatedPerf.innerText = `(right ${studyList[related[i]].rightCount || 0}, wrong ${studyList[related[i]].wrongCount || 0})`;
        item.appendChild(relatedPerf);
        relatedCardsElement.appendChild(item);
    }
    relatedCardsContainer.removeAttribute('style');
}

let setupStudyMode = function () {
    let studyList = getStudyList();
    currentKey = null;
    let currentCard = null;
    cardAnswerContainer.style.display = 'none';
    showAnswerButton.innerText = "Show Answer";
    let counter = 0;
    for (const [key, value] of Object.entries(studyList)) {
        if (value.due <= Date.now()) {
            if (!currentCard || currentCard.due > value.due ||
                (currentCard.due == value.due && value.ja.length < currentCard.ja.length)) {
                currentCard = value;
                currentKey = key;
            }
            counter++;
        }
    }
    cardsDueCounter.textContent = counter;
    cardQuestionContainer.innerHTML = '';
    if (counter === 0) {
        taskCompleteElement.style.display = 'inline';
        taskDescriptionElement.style.display = 'none';
        showAnswerButton.style.display = 'none';
        return;
    }
    taskCompleteElement.style.display = 'none';
    showAnswerButton.style.display = 'block';
    cardRenderers[currentCard.type](currentCard);
    taskDescriptionElement.style.display = 'inline';

    if (currentCard.wrongCount + currentCard.rightCount != 0) {
        cardOldMessageElement.removeAttribute('style');
        cardNewMessageElement.style.display = 'none';
        cardPercentageElement.textContent = Math.round(100 * currentCard.rightCount / ((currentCard.rightCount + currentCard.wrongCount) || 1));
        cardRightCountElement.textContent = `${currentCard.rightCount || 0} time${currentCard.rightCount != 1 ? 's' : ''}`;
        cardWrongCountElement.textContent = `${currentCard.wrongCount || 0} time${currentCard.wrongCount != 1 ? 's' : ''}`;
    } else {
        cardNewMessageElement.removeAttribute('style');
        cardOldMessageElement.style.display = 'none';
    }
    relatedCardsContainer.style.display = 'none';
};

let initialize = function () {
    showAnswerButton.addEventListener('click', function () {
        showAnswerButton.innerText = "Answer:";
        cardAnswerContainer.style.display = 'block';
        showAnswerButton.scrollIntoView();
    });
    wrongButton.addEventListener('click', function () {
        updateCard(studyResult.INCORRECT, currentKey);
        setupStudyMode();
        cardsDueElement.scrollIntoView();
        cardsDueElement.classList.add('result-indicator-wrong');
        setTimeout(function () {
            cardsDueElement.classList.remove('result-indicator-wrong');
        }, 750);
        recordEvent(studyResult.INCORRECT);
    });
    rightButton.addEventListener('click', function () {
        updateCard(studyResult.CORRECT, currentKey);
        setupStudyMode();
        cardsDueElement.scrollIntoView();
        cardsDueElement.classList.add('result-indicator-right');
        setTimeout(function () {
            cardsDueElement.classList.remove('result-indicator-right');
        }, 750);
        recordEvent(studyResult.CORRECT);
    });
    deleteCardButton.addEventListener('click', function () {
        let deletedKey = currentKey;
        removeFromStudyList(deletedKey);
        //use deletedKey rather than currentKey since saveStudyList can end up modifying what we have
        //same with addDeletedKey
        saveStudyList([deletedKey]);
        setupStudyMode();
    });
    exportStudyListButton.addEventListener('click', function () {
        let studyList = getStudyList();
        let content = "data:text/plain;charset=utf-8,";
        for (const [key, value] of Object.entries(studyList)) {
            // TODO: figure out cloze/recall exports
            if (value.type === cardTypes.RECOGNITION) {
                //replace is a hack for flashcard field separator...TODO could escape
                content += [value.ja.join('').replace(';', ''), value.en.replace(';', '')].join(';');
                content += '\n';
            }
        }
        //wow, surely it can't be this absurd
        let encodedUri = encodeURI(content);
        let link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "japanese-graph-export-" + Date.now() + ".txt");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
    if (Object.keys(getStudyList() || {}).length > 0) {
        exportStudyListButton.removeAttribute('style');
    }
    //TODO: may want to consider separate callback types for add/delete and also updated
    registerCallback(dataTypes.studyList, function (studyList) {
        if (studyList && Object.keys(studyList).length > 0) {
            exportStudyListButton.removeAttribute('style');
        } else {
            exportStudyListButton.style.display = 'none';
        }
    });
    studyTab.addEventListener('click', function () {
        setupStudyMode();
    });
};

export { initialize }