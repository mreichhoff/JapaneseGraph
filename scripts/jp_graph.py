import json
import argparse


class SetEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, set):
            return list(obj)
        return json.JSONEncoder.default(self, obj)


def parse_line(line):
    # TODO make more generic
    return line.strip().split('\t')


def get_words_with_level(lines):
    result = {}
    for line in lines:
        parsed_line = parse_line(line)
        result[parsed_line[0]] = int(parsed_line[1])
    return result


def get_graph(chars_with_level, words_with_level):
    # generate nodes at the character level with an associated minimum level field
    graph = {}
    # TODO single character word bug
    for key, value in words_with_level.items():
        max_char_level = 1
        for i in range(0, len(key)):
            if key[i] not in chars_with_level:
                continue
            max_char_level = max(max_char_level, chars_with_level[key[i]])
        for i in range(0, len(key)):
            if key[i] not in chars_with_level:
                continue
            if key[i] not in graph:
                graph[key[i]] = {'node': {
                    'word_level': value, 'char_level': chars_with_level[key[i]]}, 'edges': {}}
            for j in range(0, len(key)):
                if key[j] not in chars_with_level:
                    continue
                if j != i:
                    # TODO: determine max level instead of hardcoding to 5
                    if key[j] not in graph[key[i]]['edges']:
                        graph[key[i]]['edges'][key[j]] = {
                            'word_level': 5, 'char_level': 5, 'words': set()}
                    graph[key[i]]['edges'][key[j]]['word_level'] = min(
                        graph[key[i]]['edges'][key[j]]['word_level'], value)
                    graph[key[i]]['edges'][key[j]]['char_level'] = min(
                        graph[key[i]]['edges'][key[j]]['char_level'], max_char_level)
                    graph[key[i]]['edges'][key[j]]['words'].add(key)
            # character levels are correct on entry
            # we won't know the correct word level until the end
            graph[key[i]]['node']['word_level'] = min(
                graph[key[i]]['node']['word_level'], value)

    return graph


def main():
    parser = argparse.ArgumentParser(
        description='Build a graph of kanji word-forming relationships')
    # TODO: could also use the character list as an allow list, with the levels based on word frequency
    parser.add_argument(
        '--char-list-filename', help='the filename of a list of characters with difficulty levels')
    parser.add_argument(
        '--word-list-filename', help='the filename of a list of words with difficulty levels')
    args = parser.parse_args()
    chars_with_level = {}
    words_with_level = {}
    with open(args.char_list_filename) as f:
        chars_with_level = get_words_with_level(f.readlines())
    with open(args.word_list_filename) as f:
        words_with_level = get_words_with_level(f.readlines())
    graph = get_graph(chars_with_level, words_with_level)
    print(json.dumps(graph, ensure_ascii=False, cls=SetEncoder))


if __name__ == '__main__':
    main()
