let state = JSON.parse(localStorage.getItem('state') || '{}');
let graphPrefix = '';
if (state && state.graphPrefix) {
    graphPrefix = state.graphPrefix;
}
window.graphFetch = fetch(`./data/${graphPrefix}graph.json`);
window.sentencesFetch = fetch(`./data/${graphPrefix}sentences.json`);
window.definitionsFetch = fetch(`./data/definitions.json`);
window.wordSetFetch = fetch(`./data/word-set.json`);