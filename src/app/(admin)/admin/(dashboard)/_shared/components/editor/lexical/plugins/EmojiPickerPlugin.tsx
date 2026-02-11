/**
 * Emoji Picker Plugin
 *
 * @description ":"をトリガーに絵文字ピッカーを表示するプラグイン
 *
 * TypeaheadMenuPluginを使用して候補リストを表示
 * 選択時はTextNodeに絵文字文字を直接挿入
 */

'use client'

import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { TextNode, $createTextNode, $getSelection, $isRangeSelection } from 'lexical'

// =============================================================================
// Emoji Data (Built-in common emojis)
// =============================================================================

// emoji-mart/data を動的に読み込まずに基本的な絵文字リストを使用
// これによりバンドルサイズを削減し、初期読み込みを高速化

const EMOJI_LIST = [
  // 顔・感情
  { emoji: '😀', keywords: ['smile', 'happy', 'grin', 'egao'] },
  { emoji: '😃', keywords: ['smile', 'happy', 'smiley', 'egao'] },
  { emoji: '😄', keywords: ['smile', 'happy', 'joy', 'egao'] },
  { emoji: '😁', keywords: ['smile', 'grin', 'teeth', 'egao'] },
  { emoji: '😅', keywords: ['sweat', 'smile', 'nervous', 'ase'] },
  { emoji: '😂', keywords: ['laugh', 'cry', 'joy', 'tears', 'warai'] },
  { emoji: '🤣', keywords: ['laugh', 'rofl', 'warai'] },
  { emoji: '😊', keywords: ['blush', 'smile', 'happy', 'shy', 'hohoemi'] },
  { emoji: '😇', keywords: ['angel', 'innocent', 'halo', 'tenshi'] },
  { emoji: '🙂', keywords: ['smile', 'slightly', 'egao'] },
  { emoji: '🙃', keywords: ['upside', 'smile', 'sarcasm'] },
  { emoji: '😉', keywords: ['wink', 'flirt', 'uinku'] },
  { emoji: '😌', keywords: ['relieved', 'peaceful', 'calm', 'anshin'] },
  { emoji: '😍', keywords: ['heart', 'eyes', 'love', 'suki'] },
  { emoji: '🥰', keywords: ['love', 'hearts', 'adore', 'suki'] },
  { emoji: '😘', keywords: ['kiss', 'love', 'heart', 'kisu'] },
  { emoji: '😗', keywords: ['kiss', 'kisu'] },
  { emoji: '😙', keywords: ['kiss', 'smile', 'kisu'] },
  { emoji: '😚', keywords: ['kiss', 'blush', 'kisu'] },
  { emoji: '😋', keywords: ['yummy', 'delicious', 'tongue', 'oishi'] },
  { emoji: '😛', keywords: ['tongue', 'playful', 'bero'] },
  { emoji: '😜', keywords: ['wink', 'tongue', 'crazy', 'bero'] },
  { emoji: '🤪', keywords: ['crazy', 'zany', 'silly'] },
  { emoji: '😝', keywords: ['tongue', 'squint', 'bero'] },
  { emoji: '🤑', keywords: ['money', 'rich', 'dollar', 'okane'] },
  { emoji: '🤗', keywords: ['hug', 'embrace', 'daki'] },
  { emoji: '🤭', keywords: ['giggle', 'oops', 'cover'] },
  { emoji: '🤫', keywords: ['shush', 'quiet', 'secret', 'himitsu'] },
  { emoji: '🤔', keywords: ['think', 'hmm', 'consider', 'kangaeru'] },
  { emoji: '🤐', keywords: ['zipper', 'mouth', 'secret', 'damatte'] },
  { emoji: '🤨', keywords: ['raised', 'eyebrow', 'skeptic'] },
  { emoji: '😐', keywords: ['neutral', 'meh', 'expressionless'] },
  { emoji: '😑', keywords: ['expressionless', 'blank', 'mute'] },
  { emoji: '😶', keywords: ['silent', 'speechless', 'mute', 'damatte'] },
  { emoji: '😏', keywords: ['smirk', 'smug', 'niyaniya'] },
  { emoji: '😒', keywords: ['unamused', 'meh', 'annoyed'] },
  { emoji: '🙄', keywords: ['rolling', 'eyes', 'whatever'] },
  { emoji: '😬', keywords: ['grimace', 'awkward', 'teeth'] },
  { emoji: '😮‍💨', keywords: ['exhale', 'sigh', 'relief'] },
  { emoji: '🤥', keywords: ['lying', 'pinocchio', 'lie', 'uso'] },
  { emoji: '😌', keywords: ['relieved', 'content', 'peaceful'] },
  { emoji: '😔', keywords: ['pensive', 'sad', 'thoughtful', 'kanashii'] },
  { emoji: '😪', keywords: ['sleepy', 'tired', 'tear', 'nemui'] },
  { emoji: '🤤', keywords: ['drool', 'yummy', 'want', 'yodare'] },
  { emoji: '😴', keywords: ['sleep', 'zzz', 'tired', 'nemui'] },
  { emoji: '😷', keywords: ['mask', 'sick', 'cold', 'kaze'] },
  { emoji: '🤒', keywords: ['sick', 'thermometer', 'fever', 'netsu'] },
  { emoji: '🤕', keywords: ['bandage', 'hurt', 'injury', 'kega'] },
  { emoji: '🤢', keywords: ['nauseated', 'sick', 'vomit', 'hakike'] },
  { emoji: '🤮', keywords: ['vomit', 'sick', 'puke'] },
  { emoji: '🤧', keywords: ['sneeze', 'sick', 'achoo', 'kushami'] },
  { emoji: '🥵', keywords: ['hot', 'sweating', 'atsui'] },
  { emoji: '🥶', keywords: ['cold', 'freezing', 'samui'] },
  { emoji: '🥴', keywords: ['woozy', 'drunk', 'dizzy'] },
  { emoji: '😵', keywords: ['dizzy', 'dead', 'knocked'] },
  { emoji: '🤯', keywords: ['exploding', 'mind', 'blown', 'shock'] },
  { emoji: '🤠', keywords: ['cowboy', 'hat', 'western'] },
  { emoji: '🥳', keywords: ['party', 'celebrate', 'birthday', 'omedeto'] },
  { emoji: '🥸', keywords: ['disguise', 'incognito', 'glasses'] },
  { emoji: '😎', keywords: ['cool', 'sunglasses', 'awesome', 'kakkoii'] },
  { emoji: '🤓', keywords: ['nerd', 'geek', 'glasses', 'otaku'] },
  { emoji: '🧐', keywords: ['monocle', 'curious', 'investigate'] },
  { emoji: '😕', keywords: ['confused', 'puzzled', 'mayoi'] },
  { emoji: '😟', keywords: ['worried', 'concerned', 'shinpai'] },
  { emoji: '🙁', keywords: ['slightly', 'frown', 'sad'] },
  { emoji: '☹️', keywords: ['frown', 'sad', 'kanashii'] },
  { emoji: '😮', keywords: ['open', 'mouth', 'surprised', 'odoroki'] },
  { emoji: '😯', keywords: ['hushed', 'surprised', 'silent'] },
  { emoji: '😲', keywords: ['astonished', 'shocked', 'surprised', 'bikkuri'] },
  { emoji: '😳', keywords: ['flushed', 'embarrassed', 'shy', 'hazukashi'] },
  { emoji: '🥺', keywords: ['pleading', 'puppy', 'eyes', 'onegai'] },
  { emoji: '😦', keywords: ['frown', 'open', 'mouth', 'sad'] },
  { emoji: '😧', keywords: ['anguished', 'worried', 'distressed'] },
  { emoji: '😨', keywords: ['fearful', 'scared', 'kowai'] },
  { emoji: '😰', keywords: ['anxious', 'sweat', 'worried', 'fuan'] },
  { emoji: '😥', keywords: ['disappointed', 'relieved', 'sad'] },
  { emoji: '😢', keywords: ['cry', 'sad', 'tear', 'kanashii'] },
  { emoji: '😭', keywords: ['sob', 'cry', 'sad', 'tears', 'naku'] },
  { emoji: '😱', keywords: ['scream', 'fear', 'horror', 'kowai'] },
  { emoji: '😖', keywords: ['confounded', 'frustrated', 'upset'] },
  { emoji: '😣', keywords: ['persevere', 'struggle', 'ganbaru'] },
  { emoji: '😞', keywords: ['disappointed', 'sad', 'gakkari'] },
  { emoji: '😓', keywords: ['downcast', 'sweat', 'sad'] },
  { emoji: '😩', keywords: ['weary', 'tired', 'frustrated', 'tsukare'] },
  { emoji: '😫', keywords: ['tired', 'face', 'exhausted', 'tsukare'] },
  { emoji: '🥱', keywords: ['yawn', 'tired', 'sleepy', 'akubi'] },
  { emoji: '😤', keywords: ['triumph', 'angry', 'proud', 'ikari'] },
  { emoji: '😡', keywords: ['pouting', 'angry', 'red', 'okoru'] },
  { emoji: '😠', keywords: ['angry', 'face', 'mad', 'okoru'] },
  { emoji: '🤬', keywords: ['cursing', 'swearing', 'angry'] },
  { emoji: '😈', keywords: ['devil', 'evil', 'smile', 'akuma'] },
  { emoji: '👿', keywords: ['devil', 'angry', 'imp', 'akuma'] },
  { emoji: '💀', keywords: ['skull', 'death', 'dead', 'dokuro'] },
  { emoji: '☠️', keywords: ['skull', 'crossbones', 'danger', 'dokuro'] },
  { emoji: '💩', keywords: ['poop', 'shit', 'poo', 'unchi'] },
  { emoji: '🤡', keywords: ['clown', 'circus', 'joker'] },
  { emoji: '👹', keywords: ['ogre', 'monster', 'oni'] },
  { emoji: '👺', keywords: ['goblin', 'tengu', 'mask'] },
  { emoji: '👻', keywords: ['ghost', 'halloween', 'boo', 'obake'] },
  { emoji: '👽', keywords: ['alien', 'ufo', 'et', 'uchuujin'] },
  { emoji: '👾', keywords: ['alien', 'monster', 'game', 'invader'] },
  { emoji: '🤖', keywords: ['robot', 'android', 'bot', 'robotto'] },

  // ジェスチャー・手
  { emoji: '👍', keywords: ['thumbs', 'up', 'good', 'ok', 'ii'] },
  { emoji: '👎', keywords: ['thumbs', 'down', 'bad', 'dame'] },
  { emoji: '👏', keywords: ['clap', 'applause', 'bravo', 'hakushu'] },
  { emoji: '🙌', keywords: ['hands', 'celebrate', 'hooray', 'banzai'] },
  { emoji: '👐', keywords: ['open', 'hands', 'hug'] },
  { emoji: '🤲', keywords: ['palms', 'up', 'together'] },
  { emoji: '🤝', keywords: ['handshake', 'deal', 'agreement', 'akushu'] },
  { emoji: '🙏', keywords: ['pray', 'please', 'thanks', 'onegai', 'arigatou'] },
  { emoji: '✌️', keywords: ['peace', 'victory', 'v', 'pisu'] },
  { emoji: '🤞', keywords: ['fingers', 'crossed', 'luck', 'negau'] },
  { emoji: '🤟', keywords: ['love', 'you', 'rock'] },
  { emoji: '🤘', keywords: ['rock', 'horns', 'metal'] },
  { emoji: '🤙', keywords: ['call', 'me', 'shaka'] },
  { emoji: '👈', keywords: ['point', 'left', 'finger', 'hidari'] },
  { emoji: '👉', keywords: ['point', 'right', 'finger', 'migi'] },
  { emoji: '👆', keywords: ['point', 'up', 'finger', 'ue'] },
  { emoji: '👇', keywords: ['point', 'down', 'finger', 'shita'] },
  { emoji: '☝️', keywords: ['point', 'up', 'one', 'ichi'] },
  { emoji: '👋', keywords: ['wave', 'hello', 'bye', 'konnichiwa', 'sayonara'] },
  { emoji: '🤚', keywords: ['raised', 'back', 'hand'] },
  { emoji: '🖐️', keywords: ['hand', 'splayed', 'five'] },
  { emoji: '✋', keywords: ['hand', 'raised', 'stop', 'teishi'] },
  { emoji: '🖖', keywords: ['vulcan', 'spock', 'star', 'trek'] },
  { emoji: '💪', keywords: ['muscle', 'strong', 'bicep', 'chikara'] },
  { emoji: '🦾', keywords: ['mechanical', 'arm', 'robot'] },
  { emoji: '🙏', keywords: ['pray', 'thanks', 'namaste', 'onegai'] },

  // ハート・愛
  { emoji: '❤️', keywords: ['heart', 'love', 'red', 'ai', 'suki'] },
  { emoji: '🧡', keywords: ['heart', 'orange', 'love'] },
  { emoji: '💛', keywords: ['heart', 'yellow', 'love'] },
  { emoji: '💚', keywords: ['heart', 'green', 'love'] },
  { emoji: '💙', keywords: ['heart', 'blue', 'love'] },
  { emoji: '💜', keywords: ['heart', 'purple', 'love'] },
  { emoji: '🖤', keywords: ['heart', 'black', 'dark'] },
  { emoji: '🤍', keywords: ['heart', 'white', 'pure'] },
  { emoji: '🤎', keywords: ['heart', 'brown', 'love'] },
  { emoji: '💔', keywords: ['broken', 'heart', 'sad', 'kanashii'] },
  { emoji: '❤️‍🔥', keywords: ['heart', 'fire', 'passion'] },
  { emoji: '❤️‍🩹', keywords: ['heart', 'mending', 'healing'] },
  { emoji: '💕', keywords: ['hearts', 'two', 'love'] },
  { emoji: '💞', keywords: ['hearts', 'revolving', 'love'] },
  { emoji: '💓', keywords: ['heart', 'beating', 'love'] },
  { emoji: '💗', keywords: ['heart', 'growing', 'love'] },
  { emoji: '💖', keywords: ['heart', 'sparkle', 'love'] },
  { emoji: '💘', keywords: ['heart', 'arrow', 'cupid'] },
  { emoji: '💝', keywords: ['heart', 'ribbon', 'gift', 'present'] },
  { emoji: '💟', keywords: ['heart', 'decoration', 'love'] },

  // 動物
  { emoji: '🐶', keywords: ['dog', 'face', 'pet', 'inu'] },
  { emoji: '🐱', keywords: ['cat', 'face', 'pet', 'neko'] },
  { emoji: '🐭', keywords: ['mouse', 'face', 'nezumi'] },
  { emoji: '🐹', keywords: ['hamster', 'face', 'pet', 'hamusuta'] },
  { emoji: '🐰', keywords: ['rabbit', 'bunny', 'usagi'] },
  { emoji: '🦊', keywords: ['fox', 'face', 'kitsune'] },
  { emoji: '🐻', keywords: ['bear', 'face', 'kuma'] },
  { emoji: '🐼', keywords: ['panda', 'face', 'cute'] },
  { emoji: '🐨', keywords: ['koala', 'face', 'australia'] },
  { emoji: '🐯', keywords: ['tiger', 'face', 'tora'] },
  { emoji: '🦁', keywords: ['lion', 'face', 'king', 'raion'] },
  { emoji: '🐮', keywords: ['cow', 'face', 'ushi'] },
  { emoji: '🐷', keywords: ['pig', 'face', 'buta'] },
  { emoji: '🐸', keywords: ['frog', 'face', 'kaeru'] },
  { emoji: '🐵', keywords: ['monkey', 'face', 'saru'] },
  { emoji: '🐔', keywords: ['chicken', 'bird', 'niwatori'] },
  { emoji: '🐧', keywords: ['penguin', 'bird', 'pengin'] },
  { emoji: '🐦', keywords: ['bird', 'tori'] },
  { emoji: '🦆', keywords: ['duck', 'bird', 'kamo'] },
  { emoji: '🦅', keywords: ['eagle', 'bird', 'washi'] },
  { emoji: '🦉', keywords: ['owl', 'bird', 'fukurou'] },
  { emoji: '🐺', keywords: ['wolf', 'face', 'ookami'] },
  { emoji: '🐗', keywords: ['boar', 'pig', 'inoshishi'] },
  { emoji: '🐴', keywords: ['horse', 'face', 'uma'] },
  { emoji: '🦄', keywords: ['unicorn', 'magic', 'yunikonn'] },
  { emoji: '🐝', keywords: ['bee', 'honey', 'hachi'] },
  { emoji: '🪲', keywords: ['beetle', 'bug', 'kabutomushi'] },
  { emoji: '🐛', keywords: ['bug', 'caterpillar', 'mushi'] },
  { emoji: '🦋', keywords: ['butterfly', 'chou'] },
  { emoji: '🐌', keywords: ['snail', 'slow', 'katatsumuri'] },
  { emoji: '🐞', keywords: ['ladybug', 'bug', 'tentou'] },
  { emoji: '🐜', keywords: ['ant', 'bug', 'ari'] },
  { emoji: '🦟', keywords: ['mosquito', 'bug', 'ka'] },
  { emoji: '🦗', keywords: ['cricket', 'bug', 'korogi'] },
  { emoji: '🕷️', keywords: ['spider', 'bug', 'kumo'] },
  { emoji: '🐙', keywords: ['octopus', 'tako'] },
  { emoji: '🦑', keywords: ['squid', 'ika'] },
  { emoji: '🦐', keywords: ['shrimp', 'ebi'] },
  { emoji: '🦀', keywords: ['crab', 'kani'] },
  { emoji: '🐠', keywords: ['fish', 'tropical', 'sakana'] },
  { emoji: '🐟', keywords: ['fish', 'sakana'] },
  { emoji: '🐡', keywords: ['blowfish', 'fugu'] },
  { emoji: '🦈', keywords: ['shark', 'same'] },
  { emoji: '🐳', keywords: ['whale', 'kujira'] },
  { emoji: '🐬', keywords: ['dolphin', 'iruka'] },
  { emoji: '🐢', keywords: ['turtle', 'kame'] },
  { emoji: '🐍', keywords: ['snake', 'hebi'] },
  { emoji: '🦎', keywords: ['lizard', 'tokage'] },
  { emoji: '🦖', keywords: ['dinosaur', 'trex', 'kyouryuu'] },
  { emoji: '🦕', keywords: ['dinosaur', 'brontosaurus', 'kyouryuu'] },

  // 食べ物・飲み物
  { emoji: '🍎', keywords: ['apple', 'red', 'fruit', 'ringo'] },
  { emoji: '🍊', keywords: ['orange', 'fruit', 'mikan'] },
  { emoji: '🍋', keywords: ['lemon', 'fruit', 'remon'] },
  { emoji: '🍌', keywords: ['banana', 'fruit', 'banana'] },
  { emoji: '🍉', keywords: ['watermelon', 'fruit', 'suika'] },
  { emoji: '🍇', keywords: ['grape', 'fruit', 'budou'] },
  { emoji: '🍓', keywords: ['strawberry', 'fruit', 'ichigo'] },
  { emoji: '🫐', keywords: ['blueberry', 'fruit', 'buruberi'] },
  { emoji: '🍑', keywords: ['peach', 'fruit', 'momo'] },
  { emoji: '🍒', keywords: ['cherry', 'fruit', 'sakuranbo'] },
  { emoji: '🥝', keywords: ['kiwi', 'fruit', 'kiui'] },
  { emoji: '🍅', keywords: ['tomato', 'vegetable', 'tomato'] },
  { emoji: '🥑', keywords: ['avocado', 'fruit', 'abokado'] },
  { emoji: '🥕', keywords: ['carrot', 'vegetable', 'ninjin'] },
  { emoji: '🌽', keywords: ['corn', 'vegetable', 'toumorokoshi'] },
  { emoji: '🥒', keywords: ['cucumber', 'vegetable', 'kyuuri'] },
  { emoji: '🥦', keywords: ['broccoli', 'vegetable', 'burokkori'] },
  { emoji: '🧄', keywords: ['garlic', 'ninniku'] },
  { emoji: '🧅', keywords: ['onion', 'tamanegi'] },
  { emoji: '🍄', keywords: ['mushroom', 'kinoko'] },
  { emoji: '🥜', keywords: ['peanut', 'nut', 'pinattu'] },
  { emoji: '🍞', keywords: ['bread', 'loaf', 'pan'] },
  { emoji: '🥐', keywords: ['croissant', 'bread', 'kurowassan'] },
  { emoji: '🥖', keywords: ['baguette', 'bread', 'furansu'] },
  { emoji: '🥨', keywords: ['pretzel', 'snack', 'puretseru'] },
  { emoji: '🧀', keywords: ['cheese', 'chiizu'] },
  { emoji: '🥚', keywords: ['egg', 'tamago'] },
  { emoji: '🍳', keywords: ['egg', 'fried', 'cooking', 'medamayaki'] },
  { emoji: '🥓', keywords: ['bacon', 'meat', 'bekon'] },
  { emoji: '🥩', keywords: ['steak', 'meat', 'suteeki'] },
  { emoji: '🍗', keywords: ['chicken', 'leg', 'chikin'] },
  { emoji: '🍖', keywords: ['meat', 'bone', 'niku'] },
  { emoji: '🌭', keywords: ['hotdog', 'sausage', 'hottodoggu'] },
  { emoji: '🍔', keywords: ['hamburger', 'burger', 'hanbaga'] },
  { emoji: '🍟', keywords: ['fries', 'french', 'potato', 'furaido'] },
  { emoji: '🍕', keywords: ['pizza', 'piza'] },
  { emoji: '🥗', keywords: ['salad', 'healthy', 'sarada'] },
  { emoji: '🥪', keywords: ['sandwich', 'sandoicchi'] },
  { emoji: '🌮', keywords: ['taco', 'mexican', 'takosu'] },
  { emoji: '🌯', keywords: ['burrito', 'wrap', 'burito'] },
  { emoji: '🥙', keywords: ['pita', 'falafel', 'kebab'] },
  { emoji: '🧆', keywords: ['falafel', 'food'] },
  { emoji: '🍜', keywords: ['ramen', 'noodle', 'raamen'] },
  { emoji: '🍝', keywords: ['spaghetti', 'pasta', 'supagetti'] },
  { emoji: '🍣', keywords: ['sushi', 'fish', 'japan', 'sushi'] },
  { emoji: '🍤', keywords: ['shrimp', 'tempura', 'ebi'] },
  { emoji: '🍙', keywords: ['rice', 'ball', 'onigiri'] },
  { emoji: '🍚', keywords: ['rice', 'bowl', 'gohan'] },
  { emoji: '🍛', keywords: ['curry', 'rice', 'kare'] },
  { emoji: '🍜', keywords: ['noodle', 'soup', 'men'] },
  { emoji: '🍱', keywords: ['bento', 'box', 'bentou'] },
  { emoji: '🥟', keywords: ['dumpling', 'gyoza', 'gyouza'] },
  { emoji: '🦪', keywords: ['oyster', 'kaki'] },
  { emoji: '🍦', keywords: ['ice', 'cream', 'soft', 'aisukurimu'] },
  { emoji: '🍧', keywords: ['shaved', 'ice', 'kakigori'] },
  { emoji: '🍨', keywords: ['ice', 'cream', 'aisukurimu'] },
  { emoji: '🍩', keywords: ['donut', 'doughnut', 'donattu'] },
  { emoji: '🍪', keywords: ['cookie', 'biscuit', 'kukki'] },
  { emoji: '🎂', keywords: ['birthday', 'cake', 'party', 'tanjoubi', 'keeki'] },
  { emoji: '🍰', keywords: ['cake', 'shortcake', 'keeki'] },
  { emoji: '🧁', keywords: ['cupcake', 'muffin', 'kapukeeki'] },
  { emoji: '🥧', keywords: ['pie', 'dessert', 'pai'] },
  { emoji: '🍫', keywords: ['chocolate', 'bar', 'chokoreeto'] },
  { emoji: '🍬', keywords: ['candy', 'sweet', 'ame'] },
  { emoji: '🍭', keywords: ['lollipop', 'candy', 'peropero'] },
  { emoji: '🍮', keywords: ['pudding', 'custard', 'purin'] },
  { emoji: '🍯', keywords: ['honey', 'pot', 'hachimitsu'] },
  { emoji: '🍼', keywords: ['baby', 'bottle', 'milk', 'gyuunyuu'] },
  { emoji: '🥛', keywords: ['milk', 'glass', 'gyuunyuu'] },
  { emoji: '☕', keywords: ['coffee', 'hot', 'drink', 'kohi'] },
  { emoji: '🍵', keywords: ['tea', 'green', 'matcha', 'ocha'] },
  { emoji: '🧃', keywords: ['juice', 'box', 'juusu'] },
  { emoji: '🥤', keywords: ['cup', 'straw', 'soda', 'dorinku'] },
  { emoji: '🍶', keywords: ['sake', 'bottle', 'nihonshu'] },
  { emoji: '🍺', keywords: ['beer', 'mug', 'biiru'] },
  { emoji: '🍻', keywords: ['beer', 'cheers', 'kanpai'] },
  { emoji: '🥂', keywords: ['champagne', 'cheers', 'toast', 'kanpai'] },
  { emoji: '🍷', keywords: ['wine', 'glass', 'wain'] },
  { emoji: '🥃', keywords: ['whiskey', 'tumbler', 'uisuki'] },
  { emoji: '🍸', keywords: ['cocktail', 'martini', 'kakuteru'] },
  { emoji: '🍹', keywords: ['tropical', 'drink', 'cocktail'] },
  { emoji: '🧊', keywords: ['ice', 'cube', 'koori'] },

  // 自然・天気
  { emoji: '🌸', keywords: ['cherry', 'blossom', 'sakura', 'hana'] },
  { emoji: '💮', keywords: ['flower', 'white', 'hana'] },
  { emoji: '🌹', keywords: ['rose', 'flower', 'bara'] },
  { emoji: '🌷', keywords: ['tulip', 'flower', 'churippu'] },
  { emoji: '🌺', keywords: ['hibiscus', 'flower', 'haibisukasu'] },
  { emoji: '🌻', keywords: ['sunflower', 'flower', 'himawari'] },
  { emoji: '🌼', keywords: ['blossom', 'flower', 'hana'] },
  { emoji: '🌱', keywords: ['seedling', 'plant', 'me'] },
  { emoji: '🌲', keywords: ['tree', 'evergreen', 'pine', 'ki'] },
  { emoji: '🌳', keywords: ['tree', 'deciduous', 'ki'] },
  { emoji: '🌴', keywords: ['palm', 'tree', 'tropical', 'yashi'] },
  { emoji: '🌵', keywords: ['cactus', 'desert', 'saboten'] },
  { emoji: '🍀', keywords: ['clover', 'four', 'leaf', 'lucky', 'kuroba'] },
  { emoji: '🍁', keywords: ['maple', 'leaf', 'autumn', 'momiji'] },
  { emoji: '🍂', keywords: ['fallen', 'leaf', 'autumn', 'ochiba'] },
  { emoji: '🍃', keywords: ['leaf', 'wind', 'ha'] },
  { emoji: '☀️', keywords: ['sun', 'sunny', 'bright', 'taiyou', 'hare'] },
  { emoji: '🌙', keywords: ['moon', 'crescent', 'night', 'tsuki'] },
  { emoji: '⭐', keywords: ['star', 'night', 'hoshi'] },
  { emoji: '🌟', keywords: ['star', 'glowing', 'kirakira'] },
  { emoji: '✨', keywords: ['sparkle', 'stars', 'kirakira'] },
  { emoji: '⚡', keywords: ['lightning', 'bolt', 'thunder', 'kaminari'] },
  { emoji: '🔥', keywords: ['fire', 'hot', 'flame', 'hi', 'moeru'] },
  { emoji: '💧', keywords: ['water', 'drop', 'mizu'] },
  { emoji: '🌊', keywords: ['wave', 'ocean', 'sea', 'nami', 'umi'] },
  { emoji: '☁️', keywords: ['cloud', 'weather', 'kumo'] },
  { emoji: '⛅', keywords: ['cloud', 'sun', 'partly', 'kumori'] },
  { emoji: '🌧️', keywords: ['rain', 'cloud', 'ame'] },
  { emoji: '⛈️', keywords: ['storm', 'thunder', 'rain', 'arashi'] },
  { emoji: '🌩️', keywords: ['lightning', 'cloud', 'kaminari'] },
  { emoji: '🌨️', keywords: ['snow', 'cloud', 'yuki'] },
  { emoji: '❄️', keywords: ['snowflake', 'cold', 'winter', 'yuki'] },
  { emoji: '🌈', keywords: ['rainbow', 'niji'] },
  { emoji: '🌪️', keywords: ['tornado', 'twister', 'tatsumaki'] },

  // 活動・スポーツ
  { emoji: '⚽', keywords: ['soccer', 'ball', 'football', 'sakka'] },
  { emoji: '🏀', keywords: ['basketball', 'ball', 'basuke'] },
  { emoji: '🏈', keywords: ['football', 'american', 'amefuto'] },
  { emoji: '⚾', keywords: ['baseball', 'ball', 'yakyuu'] },
  { emoji: '🥎', keywords: ['softball', 'ball', 'sofutobooru'] },
  { emoji: '🎾', keywords: ['tennis', 'ball', 'tenisu'] },
  { emoji: '🏐', keywords: ['volleyball', 'ball', 'bare'] },
  { emoji: '🏉', keywords: ['rugby', 'ball', 'ragubi'] },
  { emoji: '🥏', keywords: ['frisbee', 'disc', 'furisubi'] },
  { emoji: '🎱', keywords: ['pool', '8ball', 'billiards', 'biriado'] },
  { emoji: '🪀', keywords: ['yoyo', 'toy', 'yoyo'] },
  { emoji: '🏓', keywords: ['ping', 'pong', 'table', 'tennis', 'takkyu'] },
  { emoji: '🏸', keywords: ['badminton', 'badominton'] },
  { emoji: '🏒', keywords: ['hockey', 'ice', 'hokke'] },
  { emoji: '🏑', keywords: ['hockey', 'field'] },
  { emoji: '🥍', keywords: ['lacrosse', 'stick'] },
  { emoji: '🏏', keywords: ['cricket', 'bat'] },
  { emoji: '🪃', keywords: ['boomerang', 'throw'] },
  { emoji: '🥊', keywords: ['boxing', 'glove', 'bokushingu'] },
  { emoji: '🥋', keywords: ['martial', 'arts', 'karate', 'judo'] },
  { emoji: '🎿', keywords: ['ski', 'snow', 'winter', 'suki'] },
  { emoji: '⛷️', keywords: ['skier', 'snow', 'suki'] },
  { emoji: '🏂', keywords: ['snowboard', 'snow', 'sunobo'] },
  { emoji: '🏄', keywords: ['surf', 'surfing', 'wave', 'safin'] },
  { emoji: '🚴', keywords: ['bike', 'cycling', 'jitensha'] },
  { emoji: '🚵', keywords: ['mountain', 'bike', 'cycling'] },
  { emoji: '🏋️', keywords: ['weight', 'lifting', 'gym', 'kintore'] },
  { emoji: '🤸', keywords: ['cartwheel', 'gymnastics', 'taisou'] },
  { emoji: '🤺', keywords: ['fencing', 'sword'] },
  { emoji: '⛳', keywords: ['golf', 'flag', 'gorufu'] },
  { emoji: '🎯', keywords: ['target', 'dart', 'bullseye', 'datu'] },
  { emoji: '🎳', keywords: ['bowling', 'boringu'] },

  // オブジェクト
  { emoji: '💻', keywords: ['laptop', 'computer', 'pc', 'pasokon'] },
  { emoji: '🖥️', keywords: ['desktop', 'computer', 'pc', 'pasokon'] },
  { emoji: '📱', keywords: ['phone', 'mobile', 'smartphone', 'sumaho'] },
  { emoji: '📷', keywords: ['camera', 'photo', 'kamera'] },
  { emoji: '🎮', keywords: ['game', 'controller', 'geemu'] },
  { emoji: '🎧', keywords: ['headphone', 'music', 'heddofon'] },
  { emoji: '🔊', keywords: ['speaker', 'loud', 'sound', 'oto'] },
  { emoji: '📺', keywords: ['tv', 'television', 'terebi'] },
  { emoji: '📻', keywords: ['radio', 'rajio'] },
  { emoji: '⏰', keywords: ['alarm', 'clock', 'time', 'mezamashi'] },
  { emoji: '⌚', keywords: ['watch', 'time', 'tokei'] },
  { emoji: '💡', keywords: ['bulb', 'light', 'idea', 'denki'] },
  { emoji: '🔦', keywords: ['flashlight', 'torch', 'kaichudentou'] },
  { emoji: '🔑', keywords: ['key', 'lock', 'kagi'] },
  { emoji: '🔒', keywords: ['lock', 'closed', 'kagi'] },
  { emoji: '🔓', keywords: ['lock', 'open', 'unlock', 'kagi'] },
  { emoji: '✂️', keywords: ['scissors', 'cut', 'hasami'] },
  { emoji: '📎', keywords: ['paperclip', 'clip', 'kurippu'] },
  { emoji: '📌', keywords: ['pushpin', 'pin', 'pin'] },
  { emoji: '📍', keywords: ['pin', 'location', 'basho'] },
  { emoji: '🗑️', keywords: ['trash', 'bin', 'delete', 'gomi'] },
  { emoji: '📦', keywords: ['box', 'package', 'hako'] },
  { emoji: '✉️', keywords: ['envelope', 'mail', 'letter', 'tegami'] },
  { emoji: '📧', keywords: ['email', 'mail', 'meeru'] },
  { emoji: '📝', keywords: ['memo', 'note', 'write', 'memo'] },
  { emoji: '📚', keywords: ['books', 'library', 'read', 'hon'] },
  { emoji: '📖', keywords: ['book', 'open', 'read', 'hon'] },
  { emoji: '🎁', keywords: ['gift', 'present', 'box', 'purezento'] },
  { emoji: '🎈', keywords: ['balloon', 'party', 'fuusen'] },
  { emoji: '🎉', keywords: ['party', 'celebrate', 'confetti', 'omedetou'] },
  { emoji: '🎊', keywords: ['confetti', 'ball', 'celebrate'] },
  { emoji: '🏆', keywords: ['trophy', 'winner', 'award', 'yushou'] },
  { emoji: '🥇', keywords: ['medal', 'gold', 'first', 'kin'] },
  { emoji: '🥈', keywords: ['medal', 'silver', 'second', 'gin'] },
  { emoji: '🥉', keywords: ['medal', 'bronze', 'third', 'dou'] },

  // 記号・マーク
  { emoji: '✅', keywords: ['check', 'done', 'complete', 'ok', 'kanryou'] },
  { emoji: '❌', keywords: ['cross', 'no', 'wrong', 'batsu'] },
  { emoji: '❓', keywords: ['question', 'help', 'gimon'] },
  { emoji: '❗', keywords: ['exclamation', 'warning', 'chuui'] },
  { emoji: '⭕', keywords: ['circle', 'ok', 'correct', 'maru'] },
  { emoji: '🔴', keywords: ['red', 'circle', 'aka'] },
  { emoji: '🟠', keywords: ['orange', 'circle', 'orenji'] },
  { emoji: '🟡', keywords: ['yellow', 'circle', 'kiiro'] },
  { emoji: '🟢', keywords: ['green', 'circle', 'midori'] },
  { emoji: '🔵', keywords: ['blue', 'circle', 'ao'] },
  { emoji: '🟣', keywords: ['purple', 'circle', 'murasaki'] },
  { emoji: '⚪', keywords: ['white', 'circle', 'shiro'] },
  { emoji: '⚫', keywords: ['black', 'circle', 'kuro'] },
  { emoji: '🔺', keywords: ['triangle', 'up', 'red', 'sankaku'] },
  { emoji: '🔻', keywords: ['triangle', 'down', 'red', 'sankaku'] },
  { emoji: '🔷', keywords: ['diamond', 'blue', 'large'] },
  { emoji: '🔶', keywords: ['diamond', 'orange', 'large'] },
  { emoji: '💯', keywords: ['hundred', 'perfect', 'score', 'manten'] },
  { emoji: '➕', keywords: ['plus', 'add', 'tasu'] },
  { emoji: '➖', keywords: ['minus', 'subtract', 'hiku'] },
  { emoji: '➗', keywords: ['divide', 'division', 'waru'] },
  { emoji: '✖️', keywords: ['multiply', 'times', 'kakeru'] },
  { emoji: '♻️', keywords: ['recycle', 'environment', 'risaikuru'] },
  { emoji: '💤', keywords: ['sleep', 'zzz', 'tired', 'nemui'] },
  { emoji: '💬', keywords: ['speech', 'bubble', 'talk', 'hanashi'] },
  { emoji: '💭', keywords: ['thought', 'bubble', 'think', 'kangae'] },
  { emoji: '🗨️', keywords: ['speech', 'left', 'talk'] },
  { emoji: '📢', keywords: ['loudspeaker', 'announce', 'megafon'] },
  { emoji: '📣', keywords: ['megaphone', 'cheer', 'oen'] },
]

// =============================================================================
// Menu Option Class
// =============================================================================

class EmojiOption extends MenuOption {
  emoji: string
  keywords: string[]

  constructor(emoji: string, keywords: string[]) {
    super(emoji)
    this.emoji = emoji
    this.keywords = keywords
  }
}

// =============================================================================
// Component
// =============================================================================

export function EmojiPickerPlugin() {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  // トリガー: ":" で発火
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch(':', {
    minLength: 1, // 最低1文字入力後に候補表示
  })

  // オプション生成
  const options = (() => {
    if (!queryString) return []

    const lowerQuery = queryString.toLowerCase()

    // キーワードマッチでフィルタリング
    const filtered = EMOJI_LIST.filter((item) =>
      item.keywords.some((kw) => kw.includes(lowerQuery))
    )

    // 上位15件に制限
    return filtered.slice(0, 15).map((item) => new EmojiOption(item.emoji, item.keywords))
  })()

  const onSelectOption = useCallback(
    (
      selectedOption: EmojiOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      _matchingString: string
    ) => {
      editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selectedOption) {
          return
        }

        // トリガー文字（":keyword"）を削除
        if (nodeToRemove) {
          nodeToRemove.remove()
        }

        // 絵文字をTextNodeとして挿入
        selection.insertNodes([$createTextNode(selectedOption.emoji)])

        closeMenu()
      })
    },
    [editor]
  )

  return (
    <LexicalTypeaheadMenuPlugin<EmojiOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) =>
        anchorElementRef.current && options.length > 0
          ? createPortal(
              <div className="fixed z-50 min-w-[200px] max-h-[280px] overflow-y-auto rounded-md border bg-popover shadow-md">
                <ul className="py-1" role="listbox">
                  {options.map((option, index) => (
                    <li
                      key={option.key}
                      tabIndex={-1}
                      role="option"
                      aria-selected={selectedIndex === index}
                      id={`emoji-item-${index}`}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => {
                        setHighlightedIndex(index)
                        selectOptionAndCleanUp(option)
                      }}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${
                        selectedIndex === index
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span className="text-xl">{option.emoji}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.keywords.slice(0, 3).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>,
              anchorElementRef.current
            )
          : null
      }
    />
  )
}
