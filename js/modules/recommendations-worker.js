let kanji = {};
let visited = {};
let maxLevel = 5;
let minLevel = 1;
const maxEdgesForRecommendation = 16;
let getRecommendations = function () {
    if (!kanji || !visited) {
        return [];
    }
    if (Object.keys(visited).length < 5) {
        return [];
    }
    let keys = Object.keys(kanji);
    let best = 0;
    let result = [];
    for (let i = 0; i < keys.length; i++) {
        if (visited[keys[i]] || kanji[keys[i]].node.level < minLevel || kanji[keys[i]].node.level > maxLevel) {
            continue;
        }
        let currentKanji = kanji[keys[i]];
        //let numerator = 0;
        //let edgeLevelTotal = 1;
        let edgeKeys = Object.keys(currentKanji.edges);
        if (edgeKeys.length > maxEdgesForRecommendation) {
            continue;
        }
        let total = 0;
        for (let j = 0; j < edgeKeys.length; j++) {
            let curr = (visited[edgeKeys[j]] || 0) / kanji[edgeKeys[j]].node.level;
            curr /= (Object.keys(kanji[edgeKeys[j]].edges).length || 1);
            total += curr;
            //TODO lots of room for improvement
            //edgeLevelTotal += kanji[edgeKeys[j]].node.level;
        }
        total /= currentKanji.node.level;
        //let total = numerator / (edgeLevelTotal / (edgeKeys.length || 1));
        if (total > best || !result.length) {
            best = total;
            result = [keys[i]];
        } else if (total == best) {
            result.push(keys[i]);
        }
    }
    result.sort((a, b) => {
        return kanji[a].node.level - kanji[b].node.level;
    });
    return result.slice(0, 3);
}
onmessage = function (e) {
    if (e.data.type === 'graph') {
        kanji = e.data.payload;
    } else if (e.data.type === 'visited') {
        visited = e.data.payload;
    } else if (e.data.type === 'levelPreferences') {
        maxLevel = e.data.payload.maxLevel;
        minLevel = e.data.payload.minLevel;
    }
}
setInterval(function () {
    let message = {
        recommendations: getRecommendations()
    };
    postMessage(message);
}, 60000);